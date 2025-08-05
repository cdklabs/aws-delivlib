import * as delivlib from '../../lib';

test('buildspec single artifact goes to "artifacts"', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo hello > foo/file.txt'],
    artifactDirectory: 'foo',
  });

  const rendered = bs.render();

  expect(rendered).toEqual({
    artifacts: {
      'base-directory': 'foo',
      'files': [
        '**/*',
      ],
    },
    phases: {
      build: {
        commands: [
          'echo hello > foo/file.txt',
        ],
      },
    },
    version: '0.2',
  });
});

test('buildspec multiple artifacts all go into "secondary-artifacts"', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo hello > foo/file.txt'],
    artifactDirectory: 'foo',
    additionalArtifactDirectories: {
      artifact2: 'boo',
    },
  });

  const rendered = bs.render({ primaryArtifactName: 'primrose' });

  expect(rendered).toEqual({
    artifacts: {
      'secondary-artifacts': {
        primrose: {
          'base-directory': 'foo',
          'files': [
            '**/*',
          ],
        },
        artifact2: {
          'base-directory': 'boo',
          'files': [
            '**/*',
          ],
        },
      },
    },
    phases: {
      build: {
        commands: [
          'echo hello > foo/file.txt',
        ],
      },
    },
    version: '0.2',
  });
});

test('buildspec empty creates minimal structure', () => {
  const bs = delivlib.BuildSpec.empty();
  const rendered = bs.render();

  expect(rendered).toEqual({
    version: '0.2',
  });
});

test('buildspec literal accepts raw structure', () => {
  const struct = {
    version: '0.2' as const,
    phases: {
      build: {
        commands: ['echo test'],
      },
    },
  };

  const bs = delivlib.BuildSpec.literal(struct);
  const rendered = bs.render();

  expect(rendered).toEqual(struct);
});

test('buildspec simple with all phases', () => {
  const bs = delivlib.BuildSpec.simple({
    install: ['npm install'],
    preBuild: ['npm run lint'],
    build: ['npm run build'],
    artifactDirectory: 'dist',
  });

  const rendered = bs.render();

  expect(rendered).toEqual({
    version: '0.2',
    phases: {
      install: {
        commands: ['npm install'],
      },
      pre_build: {
        commands: ['npm run lint'],
      },
      build: {
        commands: ['npm run build'],
      },
    },
    artifacts: {
      'base-directory': 'dist',
      'files': ['**/*'],
    },
  });
});

test('buildspec simple with reports', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['npm test'],
    reports: {
      jest: {
        'files': ['coverage/clover.xml'],
        'file-format': 'CucumberJson',
      },
    },
  });

  const rendered = bs.render();

  expect(rendered.reports).toEqual({
    jest: {
      'files': ['coverage/clover.xml'],
      'file-format': 'CucumberJson',
    },
  });
});

test('additionalArtifactNames returns correct names', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo test'],
    artifactDirectory: 'dist',
    additionalArtifactDirectories: {
      docs: 'documentation',
      assets: 'static',
    },
  });

  expect(bs.additionalArtifactNames).toEqual(['docs', 'assets']);
});

test('additionalArtifactNames excludes PRIMARY', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo test'],
    artifactDirectory: 'dist',
  });

  expect(bs.additionalArtifactNames).toEqual([]);
});

test('merge combines two buildspecs', () => {
  const bs1 = delivlib.BuildSpec.simple({
    install: ['npm install'],
    build: ['npm run build'],
  });

  const bs2 = delivlib.BuildSpec.simple({
    preBuild: ['npm run lint'],
    build: ['npm run test'],
  });

  const merged = bs1.merge(bs2);
  const rendered = merged.render();

  expect(rendered.phases).toEqual({
    install: {
      commands: ['npm install'],
    },
    pre_build: {
      commands: ['npm run lint'],
    },
    build: {
      commands: ['npm run build', 'npm run test'],
    },
  });
});

test('merge throws on duplicate artifact names', () => {
  const bs1 = delivlib.BuildSpec.simple({
    additionalArtifactDirectories: { docs: 'docs1' },
  });

  const bs2 = delivlib.BuildSpec.simple({
    additionalArtifactDirectories: { docs: 'docs2' },
  });

  expect(() => bs1.merge(bs2)).toThrow('There is already an artifact with name docs');
});

test('merge throws on duplicate report names', () => {
  const bs1 = delivlib.BuildSpec.simple({
    reports: { test: { files: ['test1.xml'] } },
  });

  const bs2 = delivlib.BuildSpec.simple({
    reports: { test: { files: ['test2.xml'] } },
  });

  expect(() => bs1.merge(bs2)).toThrow('Reports must have unique names');
});

test('render throws when PRIMARY artifact name not supplied', () => {
  const bs = delivlib.BuildSpec.simple({
    artifactDirectory: 'dist',
    additionalArtifactDirectories: { docs: 'documentation' },
  });

  expect(() => bs.render()).toThrow('Replacement name for PRIMARY artifact not supplied');
});

test('merge handles environment variables', () => {
  const bs1 = delivlib.BuildSpec.literal({
    version: '0.2',
    env: {
      variables: { NODE_ENV: 'production' },
    },
  });

  const bs2 = delivlib.BuildSpec.literal({
    version: '0.2',
    env: {
      variables: { DEBUG: 'true' },
    },
  });

  const merged = bs1.merge(bs2);
  const rendered = merged.render();

  expect(rendered.env?.variables).toEqual({
    NODE_ENV: 'production',
    DEBUG: 'true',
  });
});

test('merge handles cache paths', () => {
  const bs1 = delivlib.BuildSpec.literal({
    version: '0.2',
    cache: { paths: ['node_modules/**/*'] },
  });

  const bs2 = delivlib.BuildSpec.literal({
    version: '0.2',
    cache: { paths: ['.npm/**/*'] },
  });

  const merged = bs1.merge(bs2);
  const rendered = merged.render();

  expect(rendered.cache?.paths).toEqual(['node_modules/**/*', '.npm/**/*']);
});

test('merge handles install phase runtime-versions', () => {
  const bs1 = delivlib.BuildSpec.literal({
    version: '0.2',
    phases: {
      install: {
        'commands': ['echo install'],
        'runtime-versions': { nodejs: '18' },
      },
    },
  });

  const bs2 = delivlib.BuildSpec.literal({
    version: '0.2',
    phases: {
      install: {
        'commands': ['npm install'],
        'runtime-versions': { python: '3.9' },
      },
    },
  });

  const merged = bs1.merge(bs2);
  const rendered = merged.render();

  expect(rendered.phases?.install).toEqual({
    'commands': ['echo install', 'npm install'],
    'runtime-versions': { nodejs: '18', python: '3.9' },
  });
});
