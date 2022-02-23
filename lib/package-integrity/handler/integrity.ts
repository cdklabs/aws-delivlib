import { execSync } from 'child_process';
import type { RequestOptions, IncomingMessage } from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import AdmZip from 'adm-zip';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as fs from 'fs-extra';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as jstream from 'JSONStream';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as tar from 'tar';
import { Repository } from './repository';


/**
 * Published package.
 */
export interface PublishedPackage {

  /**
   * Name of the package as stored in the package manager.
   */
  readonly name: string;

  /**
   * Version of the package as stored in the package manager.
   */
  readonly version: string;
}

/**
 * Integrity class for validating a local artifact against its published counterpart.
 *
 * Implementations differ based on the package manager in question.
 */
export abstract class ArtifactIntegrity {

  /**
   * The file extenstion of artifacts produced for this check. (e.g 'whl')
   */
  protected abstract readonly ext: string;

  /**
   * Download a package to the target file.
   *
   * @param pkg The package to download.
   * @param targetFile The file path to download the package to.
   */
  protected abstract download(pkg: PublishedPackage, targetFile: string): Promise<void>;

  /**
   * Extract the artifact into the target directory.
   *
   * @param artifact Path to an artifact file.
   * @param targetDir The directory to extract to. It will exist by the time this method is invoked.
   */
  protected abstract extract(artifact: string, targetDir: string): Promise<void>;

  /**
   * Parse a local artifact file name into a structured package.
   *
   * @param artifactName Base name of the local artifact file.
   * @returns The package this artifact correlates to.
   */
  protected abstract parseArtifactName(artifactName: string): PublishedPackage;

  /**
   * Validate a local artifact against its published counterpart.
   *
   * @param localArtifactDir The directory of the local artifact. Must contain exactly one file with the appropriate extenstion.
   */
  public async validate(localArtifactDir: string) {

    const artifactPath = this.findOne(localArtifactDir);
    const name = this.constructor.name;

    this.log(`Validating ${artifactPath}`);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-check'));

    try {
      const downloaded = path.join(workdir, `${name}.downloaded`);
      const remote = path.join(workdir, `${name}.remote`);
      const local = path.join(workdir, `${name}.local`);

      // parse the artifact name into a package.
      const pkg = this.parseArtifactName(path.basename(artifactPath));

      fs.mkdirSync(remote);
      fs.mkdirSync(local);

      // download the package
      this.log(`Downloading ${pkg.name}@${pkg.version} to ${downloaded}`);
      await this.download(pkg, downloaded);

      // extract the downlaoded package
      this.log(`Extracting remote artifact from ${downloaded} to ${remote}`);
      await this.extract(downloaded, remote);
      execSync(`ls -l ${remote}`, { stdio: ['ignore', 'inherit', 'inherit'] });

      // extract the local artfiact
      this.log(`Extracting local artifact from ${artifactPath} to ${local}`);
      await this.extract(artifactPath, local);
      execSync(`ls -l ${local}`, { stdio: ['ignore', 'inherit', 'inherit'] });

      this.log(`Comparing ${local} <> ${remote}`);
      try {
        execSync(`diff ${local} ${remote}`, { stdio: ['ignore', 'inherit', 'inherit'] });
      } catch (error) {
        throw new Error(`${name} validation failed`);
      }
      this.log('Success');

    } finally {
      fs.removeSync(workdir);
    }

  }

  protected log(message: string) {
    console.log(`${this.constructor.name} | ${message} `);
  }

  private findOne(dir: string): string {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(this.ext));
    if (files.length === 0) {
      throw new Error(`No files found in ${dir} with extension ${this.ext}`);
    }
    const [first, ...rest] = files;
    if (rest.length > 0) {
      throw new Error(`Multiple files found in ${dir} with extension ${this.ext}: ${first}, ${rest.join(', ')}`);
    }
    return path.join(dir, first);
  }

}

/**
 * Properties for `RepositoryIntegrity`.
 */
export interface RepositoryIntegrityProps {
  /**
   * Repository to validate.
   */
  readonly repository: Repository;

  /**
   * The command that produces the local artifacts.
   *
   * @default 'npx projen release'
   */
  readonly packTask?: string;
}

/**
 * Integrity class for validating the artifacts produced by this repository against their published counterparts.
 */
export class RepositoryIntegrity {

  public constructor(private readonly props: RepositoryIntegrityProps) {}

  /**
   * Validate the artifacts of this repo against its published counterpart.
   */
  public async validate() {

    // note that run 'release' by default to preserve the version number.
    // this won't do a bump since the commit we are on is already tagged.
    const artifacts = this.props.repository.pack(this.props.packTask ?? 'npx projen release');

    let integrity = undefined;
    for (const artifact of artifacts) {
      console.log(`artifact: ${artifact.directory} (${artifact.lang})`);
      switch (artifact.lang) {
        case 'js':
          integrity = new NpmArtifactIntegrity();
          break;
        case 'python':
          integrity = new PyPIArtifactIntegrity();
          break;
        default:
          break;
      }
      if (integrity) {
        await integrity.validate(artifact.directory);
      }
    }
    console.log('Validation done');
  }

}

/**
 * NpmIntegiry is able to perform integiry checks against packages stored on npmjs.com
 */
export class NpmArtifactIntegrity extends ArtifactIntegrity {

  protected readonly ext = 'tgz';

  protected async download(pkg: PublishedPackage, target: string): Promise<void> {
    const tarballUrl = await jsonGet(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, ['dist', 'tarball']);
    await download(tarballUrl, target);
  }

  public async extract(file: string, targetDir: string): Promise<void> {
    return tar.x({ cwd: targetDir, file: file, strip: 1 });
  }

  protected parseArtifactName(artifactName: string): PublishedPackage {

    // cdk8s@1.0.0-beta.59.jsii.tgz
    const jsiiArtifact = /(.*)@(.*)\.jsii./;

    // npm artifact: cdk8s-cli-1.0.0-beta59.tgz
    // yarn artifact: cdk8s-cli-v1.0.0-beta59.tgz (add a 'v' before the version)
    const npmOrYarnArtifact = /(.*)-v?(\d.*).(tgz|tar.gz)/;

    const regex = artifactName.includes('.jsii.') ? jsiiArtifact : npmOrYarnArtifact;

    const match = artifactName.match(regex);
    if (!match) {
      throw new Error(`Unable to parse artifact: ${artifactName}`);
    }

    return { name: match[1], version: match[2] };

  }

}

/**
 * PyPIIntegiry is able to perform integiry checks against packages stored on pypi.org
 */
export class PyPIArtifactIntegrity extends ArtifactIntegrity {

  protected readonly ext = 'whl';

  protected async download(pkg: PublishedPackage, target: string): Promise<void> {

    const files = await jsonGet(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`, ['releases', pkg.version]);
    const wheels: string[] = files.filter((f: any) => f.url.endsWith('whl')).map((f: any) => f.url);

    if (wheels.length === 0) {
      throw new Error(`No wheels found for package ${pkg.name}-${pkg.version}`);
    }

    if (wheels.length > 1) {
      throw new Error(`Multiple wheels found for package ${pkg.name}-${pkg.version}: ${wheels.join(',')}`);
    }

    await download(wheels[0], target);
  }

  public async extract(artifact: string, target: string): Promise<void> {
    const zip = new AdmZip(artifact);
    return zip.extractAllTo(target);
  }

  protected parseArtifactName(artifactName: string): PublishedPackage {

    // cdk8s-1.0.0b63-py3-none-any.whl
    const regex = /(.*)-v?(\d.*)-py.*.whl/;

    const match = artifactName.match(regex);
    if (!match) {
      throw new Error(`Unable to parse artifact: ${artifactName}`);
    }

    return { name: match[1], version: match[2] };

  }

}

export function jsonGet(url: string, jsonPath?: string[]): Promise<any> {
  return get(url, (res, ok, ko) => {
    const json = jstream.parse(jsonPath);
    json.once('data', ok);
    json.once('error', ko);

    res.pipe(json, { end: true });
  }, { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' } });
}

export async function download(url: string, targetFile: string): Promise<any> {
  return get(url, (res, ok, ko) => {
    const file = fs.createWriteStream(targetFile);
    file.on('finish', ok);
    file.on('error', ko);
    res.pipe(file, { end: true });
  });
}

export async function get(
  url: string,
  handler: (res: IncomingMessage, ok: (value: unknown) => void, ko: (err: Error) => void) => void,
  options: RequestOptions = {}) {

  return new Promise((ok, ko) => {
    const request = https.get(url, options, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        const error = new Error(`GET ${url} - HTTP ${res.statusCode} (${res.statusMessage})`);
        Error.captureStackTrace(error);
        return ko(error);
      }
      res.once('error', ko);
      handler(res, ok, ko);
    });
    request.on('error', ko);
  });

}
