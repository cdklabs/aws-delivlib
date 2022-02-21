import * as child from 'child_process';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
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

function initializeRepo(repoDir: string): Repository {

  const shell = (command: string) => child.execSync(command, { cwd: repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

  // we need CI=false since projen defaults to CI=true in a GitHub
  // environment, and project generation normally happens outside of CI.
  const projen = () => shell('CI=false ./node_modules/.bin/projen');

  const isProjen = fs.existsSync(path.join(repoDir, '.projenrc.js'));

  if (isProjen) {
    // see https://github.com/projen/projen/issues/1356
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;
    shell(`npm install --no-package-lock projen@${projenVersion}`);
    projen();

    // not sure why - but we need to run projen again to synchronize the lock file...
    projen();

  }

  shell('git init -b main');

  // otherwise it won't run in github actions...
  shell('git config user.email "you@example.com"');
  shell('git config user.name "example"');

  shell('git add .');
  shell('git commit -m initial');
  shell('git tag -a v0.0.0 -m v0.0.0');

  console.log(`Initilized repository: ${repoDir}`);
  shell('ls -l');

  return new Repository(repoDir);
}

async function withRepo(fixture: string, work: (repoDir: string) => Promise<void>) {

  const tempdir = fs.mkdtempSync(path.join(os.tmpdir(), path.sep));
  try {
    const repoDir = path.join(tempdir, fixture);
    fs.mkdirSync(repoDir);
    fs.copySync(fixturePath(fixture), repoDir);
    await work(repoDir);
  } finally {
    fs.removeSync(tempdir);
  }
}

function createIntegrity(inputs: IntegrityInputs) {

  jest.spyOn<any, any>(NpmArtifactIntegrity.prototype, 'download').mockImplementation(inputs.npmDownload as any);
  jest.spyOn<any, any>(PyPIArtifactIntegrity.prototype, 'download').mockImplementation(inputs.pypiDownload as any);
  jest.spyOn<any, any>(RepositoryIntegrity.prototype, 'clone').mockImplementation(() => initializeRepo(inputs.repoDir));

  return new RepositoryIntegrity({
    githubTokenSecretArn: 'dummy',
    repository: 'dummy',
  });

}

beforeEach(() => {
  jest.restoreAllMocks();
});


test('happy projen-jsii', async () => {

  await withRepo('projen-jsii-project', async (repoDir) => {

    // happy path - simply copy over the actual artifacts

    const npmDownload = async (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}@${pkg.version}.jsii.tgz`;
      fs.copySync(path.join(dist, 'js', name), targetFile);
    };

    const pypiDownload = async (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), targetFile);
    };

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    await integrity.validate();

  });

});

test('happy projen-non-jsii', async () => {

  await withRepo('projen-non-jsii-project', async (repoDir) => {

    // happy path - simply copy over the actual artifacts

    const npmDownload = (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}.tgz`;
      fs.copySync(path.join(dist, 'js', name), targetFile);
    };

    const pypiDownload = (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), targetFile);
    };

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    await integrity.validate();

  });

});


test('unhappy npm artifact', async () => {

  await withRepo('projen-jsii-project', async (repoDir) => {

    // unhappy path - conjure up corrupted artifacts

    const npmDownload = (_: PublishedPackage, targetFile: string) => {
      tar.create({ file: targetFile, gzip: true, sync: true },
        [path.join(repoDir, 'package.json')],
      );
    };

    const pypiDownload = (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}-${pkg.version}-py3-none-any.whl`;
      fs.copySync(path.join(dist, 'python', name), targetFile);
    };

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    return expect(integrity.validate()).rejects.toThrow('NpmArtifactIntegrity validation failed');

  });
});

test('unhappy pypi artifcat', async () => {

  await withRepo('projen-jsii-project', async (repoDir) => {

    // unhappy path - conjure up corrupted artifacts

    const npmDownload = (pkg: PublishedPackage, targetFile: string) => {
      const dist = path.join(repoDir, 'dist');
      const name = `${pkg.name}@${pkg.version}.jsii.tgz`;
      fs.copySync(path.join(dist, 'js', name), targetFile);
    };

    const pypiDownload = (_: PublishedPackage, targetFile: string) => {
      const whl = new AdmZip();
      whl.addLocalFile(path.join(repoDir, 'package.json'));
      whl.writeZip(targetFile);
    };

    const integrity = createIntegrity({ repoDir, npmDownload, pypiDownload });
    return expect(integrity.validate()).toThrowError('PyPIArtifactIntegrity validation failed');

  });
});


test('only projen projects are supported', async () => {

  await withRepo('non-projen-project', async (repoDir) => {
    const integrity = createIntegrity({ repoDir, npmDownload: {} as any, pypiDownload: {} as any });
    return expect(integrity.validate()).rejects.toThrowError('Only projen managed repositories are supported at this time');
  });

});

test('only yarn projects are supported', async () => {

  await withRepo('non-yarn-project', (repoDir) => {
    const integrity = createIntegrity({ repoDir, npmDownload: {} as any, pypiDownload: {} as any });
    return expect(integrity.validate()).rejects.toThrowError('Only yarn managed repositories are supported at this time');
  });

});
