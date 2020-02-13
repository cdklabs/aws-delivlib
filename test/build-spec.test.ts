import delivlib = require("../lib");


test('buildspec single artifact goes to "artifacts"', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo hello > foo/file.txt'],
    artifactDirectory: 'foo'
  });

  const rendered = bs.render();

  expect(rendered).toEqual({
    artifacts: {
      "base-directory": "foo",
      "files": [
        "**/*",
      ],
    },
    phases: {
      build: {
        commands: [
          "echo hello > foo/file.txt",
        ],
      },
    },
    version: "0.2",
  });
});

test('buildspec multiple artifacts all go into "secondary-artifacts"', () => {
  const bs = delivlib.BuildSpec.simple({
    build: ['echo hello > foo/file.txt'],
    artifactDirectory: 'foo',
    additionalArtifactDirectories: {
      artifact2: 'boo',
    }
  });

  const rendered = bs.render({ primaryArtifactName: 'primrose' });

  expect(rendered).toEqual({
    artifacts: {
      "secondary-artifacts": {
        primrose: {
          "base-directory": "foo",
          "files": [
            "**/*",
          ],
        },
        artifact2: {
          "base-directory": "boo",
          "files": [
            "**/*",
          ],
        }
      }
    },
    phases: {
      build: {
        commands: [
          "echo hello > foo/file.txt",
        ],
      },
    },
    version: "0.2",
  });
});