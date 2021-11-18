import * as fs from 'fs';
import * as path from 'path';
import { NpmArtifactIntegrity, PublishedPackage, PyPIArtifactIntegrity, RepositoryIntegrity } from '../../../package-integrity/handler/integrity';
import { Repository } from '../../../package-integrity/handler/repository';

function repoFixture(name: string) {
  return path.join(__dirname, '__fixtures__', name);
}

type Downloader = (pkg: PublishedPackage, target: string) => void;

function createIntegrity(fixture: string, npmDownloader: Downloader, pypiDownloader: Downloader): RepositoryIntegrity {

  jest.spyOn<any, any>(NpmArtifactIntegrity.prototype, 'download').mockImplementation(npmDownloader as any);
  jest.spyOn<any, any>(PyPIArtifactIntegrity.prototype, 'download').mockImplementation(pypiDownloader as any);
  jest.spyOn<any, any>(RepositoryIntegrity.prototype, 'clone').mockImplementation(() => {
    const repo = repoFixture(fixture);
    return new Repository(repo);
  });

  return new RepositoryIntegrity({
    githubTokenSecretArn: 'dummy',
    repository: 'dummy',
  });

}

afterAll(() => {
  jest.restoreAllMocks();
});

test('happy', () => {
  const fixture = 'projen-project';
  const integrity = createIntegrity(fixture,
    (pkg: PublishedPackage, target: string) => {
      const dist = path.join(repoFixture(fixture), 'dist');
      fs.copyFileSync(path.join(dist, 'js', `${pkg.name}-v${pkg.version}.tgz`), target);
    },
    (pkg: PublishedPackage, target: string) => {
      fs.copyFileSync(`${repoFixture(fixture)}`, target);
    });
  integrity.validate();
});

test('unhappy', () => {
  const integrity = createIntegrity('');
  integrity.validate();
});

test('fails on non-projen repository', () => {});

test('jsii-package with a custom outdir', () => {
  const integrity = createIntegrity('');
  integrity.validate();
});
