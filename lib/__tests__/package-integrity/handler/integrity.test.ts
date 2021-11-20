import * as child from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as tar from 'tar';
import { NpmArtifactIntegrity, PublishedPackage, PyPIArtifactIntegrity, RepositoryIntegrity } from '../../../package-integrity/handler/integrity';
import { Repository } from '../../../package-integrity/handler/repository';

function fixturePath(name: string) {
  return path.join(__dirname, '__fixtures__', name);
}

type Download = (pkg: PublishedPackage, target: string) => void;

interface IntegrityInputs {
  npmDownload: Download;
  pypiDownload: Download;
  repoDir: string;
}

function generateRepo(repoDir: string) {

  const shell = (command: string) => child.execSync(command, { cwd: repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

  shell('npm install --no-package-lock projen && rm -rf package.json');
  shell('./node_modules/.bin/projen');
  shell('yarn install');
  shell('git init -b main');
  shell('git add .');
  shell('git commit -m projen');
  shell('git tag -a v0.0.0 -m v0.0.0');

}

function withRepoDir(fixture: string, work: (repoDir: string) => void) {

  const tempdir = fs.mkdtempSync(path.join(os.tmpdir()));
  const repoDir = path.join(tempdir, fixture);
  fs.mkdirSync(repoDir);
  try {
    fs.copySync(fixturePath(fixture), repoDir);
    work(repoDir);
  } finally {
    fs.removeSync(repoDir);
  }
}

function createIntegrity(inputs: IntegrityInputs) {

  const clone = () => new Repository(inputs.repoDir);

  jest.spyOn<any, any>(NpmArtifactIntegrity.prototype, 'download').mockImplementation(inputs.npmDownload as any);
  jest.spyOn<any, any>(PyPIArtifactIntegrity.prototype, 'download').mockImplementation(inputs.pypiDownload as any);
  jest.spyOn<any, any>(RepositoryIntegrity.prototype, 'clone').mockImplementation(clone);

  return new RepositoryIntegrity({
    githubTokenSecretArn: 'dummy',
    repository: 'dummy',
  });

}

afterAll(() => {
  jest.restoreAllMocks();
});


test('happy projen-jsii', () => {

  withRepoDir('projen-jsii-project', (repoDir) => {

    const npmDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}@${pkg.version}.jsii.tgz`;
      fs.copySync(path.join(dist, 'js', name), path.join(target, name));
    };

    const pypiDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), path.join(target, name));
    };

    generateRepo(repoDir);

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    integrity.validate();

  });

});

test('happy projen-non-jsii', () => {

  withRepoDir('projen-non-jsii-project', (repoDir) => {

    const npmDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-v${pkg.version}.tgz`;
      fs.copySync(path.join(dist, 'js', name), path.join(target, name));
    };

    const pypiDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), path.join(target, name));
    };

    generateRepo(repoDir);

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    integrity.validate();

  });

});


test('unhappy npm artifact', () => {

  withRepoDir('projen-jsii-project', (repoDir) => {

    const npmDownload = (pkg: PublishedPackage, target: string) => {
      const name = `${pkg.name}@${pkg.version}.jsii.tgz`;

      // conjure up a corrupted tar
      tar.create({ file: path.join(target, name), gzip: true, sync: true },
        // tarring only package.json should create a diff
        [path.join(repoDir, 'package.json')],
      );
    };

    const pypiDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), path.join(target, name));
    };

    generateRepo(repoDir);

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    expect(() => integrity.validate()).toThrowError('NpmArtifactIntegrity validation failed');

  });
});

test('unhappy pypi artifcat', () => {

  withRepoDir('projen-jsii-project', (repoDir) => {

    const npmDownload = (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}@${pkg.version}.jsii.tgz`;
      fs.copySync(path.join(dist, 'js', name), path.join(target, name));
    };

    const pypiDownload = (pkg: PublishedPackage, target: string) => {
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;

      // conjure up a corrupted whl
      const whl = new AdmZip();

      // tarring only package.json should create a diff
      whl.addLocalFile(path.join(repoDir, 'package.json'));

      whl.writeZip(path.join(target, name));

    };

    generateRepo(repoDir);

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    expect(() => integrity.validate()).toThrowError('PyPIArtifactIntegrity validation failed');

  });
});


test('only projen projects are supported', () => {

  withRepoDir('non-projen-project', (repoDir) => {
    const integrity = createIntegrity({ repoDir, npmDownload: {} as any, pypiDownload: {} as any });
    expect(() => integrity.validate()).toThrowError('Only projen managed repositories are supported at this time');
  });

});

test('only yarn projects are supported', () => {

  withRepoDir('non-yarn-project', (repoDir) => {
    const integrity = createIntegrity({ repoDir, npmDownload: {} as any, pypiDownload: {} as any });
    expect(() => integrity.validate()).toThrowError('Only yarn managed repositories are supported at this time');
  });

});

