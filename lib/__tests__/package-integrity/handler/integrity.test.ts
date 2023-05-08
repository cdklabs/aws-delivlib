import * as child from 'child_process';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as fs from 'fs-extra';
import * as tar from 'tar';
import { NpmArtifactIntegrity, PublishedPackage, PyPIArtifactIntegrity, RepositoryIntegrity } from '../../../package-integrity/handler/integrity';
import { Repository } from '../../../package-integrity/handler/repository';

// these test might take some time since they run jsii-pacmak...
jest.setTimeout(5 * 60 * 1000);

function fixturePath(name: string) {
  return path.join(__dirname, '__fixtures__', name);
}

type Download = (pkg: PublishedPackage, target: string) => void;

interface IntegrityInputs {
  npmDownload: Download;
  pypiDownload: Download;
  repo: Repository;
}

function generateProject(fixture: string): string {

  const tempdir = fs.mkdtempSync(path.join(os.tmpdir(), path.sep));
  const repoDir = path.join(tempdir, fixture);
  fs.mkdirSync(repoDir);
  fs.copySync(fixturePath(fixture), repoDir);

  const shell = (command: string) => child.execSync(command, { cwd: repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

  // we need CI=false since projen defaults to CI=true in a GitHub
  // environment, and project generation normally happens outside of CI.
  const projen = () => shell(`CI=false ${path.join(require.resolve('projen'), '..', '..', 'bin', 'projen')}`);

  const isProjen = fs.existsSync(path.join(repoDir, '.projenrc.js'));

  if (isProjen) {
    // project is created with only .projenrc.js and sometimes it doesn't
    // yarn install correctly, if this happens try to yarn install again
    try {
      projen();
    } catch (e) {
      shell('yarn install --check-files');
      projen();
    }
  }

  return repoDir;
}

function createIntegrity(inputs: IntegrityInputs) {

  jest.spyOn<any, any>(NpmArtifactIntegrity.prototype, 'download').mockImplementation(inputs.npmDownload as any);
  jest.spyOn<any, any>(PyPIArtifactIntegrity.prototype, 'download').mockImplementation(inputs.pypiDownload as any);

  // we don't need a pack task since we prepack in the test
  return new RepositoryIntegrity({ repository: inputs.repo, packCommand: 'echo success' });

}

/**
 * Helper class to cache packed repositories since it takes a long.
 */
class Repositories {

  private _jsii: Repository | undefined;
  private _ts: Repository | undefined;

  public async jsii(): Promise<Repository> {
    if (!this._jsii) {
      const repoDir = generateProject('projen-jsii-project');
      this._jsii = await Repository.fromDir({ repoDir });
      this._jsii.pack('npx projen build');
    }
    return this._jsii!;
  }

  public async ts(): Promise<Repository> {
    if (!this._ts) {
      const repoDir = generateProject('projen-non-jsii-project');
      this._ts = await Repository.fromDir({ repoDir });
      this._ts.pack('npx projen build');
    }
    return this._ts!;
  }

  public clean() {
    if (this._jsii) {
      fs.removeSync(this._jsii.repoDir);
    }
    if (this._ts) {
      fs.removeSync(this._ts.repoDir);
    }
  }

}

const repositories = new Repositories();

beforeEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  repositories.clean();
});

test('happy jsii', async () => {

  const repo = await repositories.jsii();
  const repoDir = repo.repoDir;

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

  const integrity = createIntegrity({ repo: repo, npmDownload, pypiDownload });
  await integrity.validate();

});

test('unhappy npm jsii', async () => {

  const repo = await repositories.jsii();
  const repoDir = repo.repoDir;

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

  const integrity = createIntegrity({ repo: repo, npmDownload, pypiDownload });
  return expect(integrity.validate()).rejects.toThrow('NpmArtifactIntegrity validation failed');

});

test('unhappy pypi jsii', async () => {

  const repo = await repositories.jsii();
  const repoDir = repo.repoDir;

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

  const integrity = createIntegrity({ repo: repo, npmDownload, pypiDownload });
  return expect(integrity.validate()).rejects.toThrowError('PyPIArtifactIntegrity validation failed');

});

test('happy ts', async () => {

  const repo = await repositories.ts();
  const repoDir = repo.repoDir;

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

  const integrity = createIntegrity({ repo: repo, npmDownload, pypiDownload });
  await integrity.validate();

});

test('only projen projects are supported', async () => {
  const repoDir = generateProject('non-projen-project');
  return expect(Repository.fromDir({ repoDir })).rejects.toThrowError('Only projen managed repositories are supported at this time');
});

test('only yarn projects are supported', async () => {
  const repoDir = generateProject('non-yarn-project');
  return expect(Repository.fromDir({ repoDir })).rejects.toThrowError('Only yarn managed repositories are supported at this time');
});
