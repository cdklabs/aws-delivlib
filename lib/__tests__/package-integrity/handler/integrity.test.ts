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
    return new Repository(repo, '1.0.0');
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
  const integrity = createIntegrity('package1',
    (pkg: PublishedPackage, target: string) => {
      // just copy over the artifact
    },
    (pkg: PublishedPackage, target: string) => {

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
