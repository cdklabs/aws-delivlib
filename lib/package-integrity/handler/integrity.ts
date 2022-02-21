import { execSync } from 'child_process';
import type { RequestOptions, IncomingMessage } from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as AWS from 'aws-sdk';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as fs from 'fs-extra';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as jstream from 'JSONStream';
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
  protected abstract extract(artifact: string, targetDir: string): void;

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
      this.extract(downloaded, remote);

      // extract the local artfiact
      this.log(`Extracting local artifact from ${artifactPath} to ${local}`);
      this.extract(artifactPath, local);

      this.log(`Comparing ${local} <> ${remote}`);
      try {
        execSync(`diff ${local} ${remote}`, { stdio: ['ignore', 'inherit', 'inherit'] });
      } catch (error) {
        throw new Error(`${name} validation failed`);
      }
      this.log('Success');

    } finally {
      // fs.removeSync(workdir);
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
   * Repository slug (e.g cdk8s-team/cdk8s-core)
   */
  readonly repository: string;

  /**
   * ARN of an AWS secrets manager secret containing a GitHub token.
   * Required for private repositories. Recommended for public ones, to avoid throtlling issues.
   *
   * @default - the repository is cloned without credentials.
   */
  readonly githubTokenSecretArn?: string;

  /**
   * Repository tag.
   *
   * @default - latest tag based on creation date.
   */
  readonly tag?: string;

  /**
   * Prefix for detecting the latest tag of the repo. Only applies if `tag` isn't specified.
   * This is useful for repositories that produce multiple packages, and hence multiple tags
   * for example: https://github.com/cdk8s-team/cdk8s-plus/tags.
   */
  readonly tagPrefix?: string;

  /**
   * The projen task that produces the local artifacts.
   *
   * @default 'release'
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

    const repo = await this.clone();
    const artifacts = repo.pack(this.props.packTask);

    let integrity = undefined;
    for (const artifact of artifacts) {
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

  public async clone(): Promise<Repository> {

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'work'));
    const sm = new AWS.SecretsManager();

    let token = undefined;
    if (this.props.githubTokenSecretArn) {
      const secret = await sm.getSecretValue({ SecretId: this.props.githubTokenSecretArn }).promise();
      token = secret.SecretString;
    }
    const repoDir = fs.mkdtempSync(path.join(workdir, 'repo'));

    console.log(`Cloning ${this.props.repository} into ${repoDir}`);
    execSync(`git clone https://${token ? `${token}@` : ''}github.com/${this.props.repository}.git ${repoDir}`);

    const latestTag = this.findLatestTag(repoDir, this.props.tagPrefix);
    execSync(`git checkout ${latestTag}`, { cwd: repoDir });

    return new Repository(repoDir);
  }

  private findLatestTag(repoDir: string, prefix?: string) {
    const tags = execSync(`git tag -l --sort=-creatordate "${prefix ?? ''}*"`, { cwd: repoDir }).toString();
    return tags.split(os.EOL)[0].trim();
  }

}

/**
 * NpmIntegiry is able to perform integiry checks against packages stored on npmjs.com
 */
export class NpmArtifactIntegrity extends ArtifactIntegrity {

  protected readonly ext = 'tgz';

  protected async download(pkg: PublishedPackage, target: string): Promise<void> {
    const metadata = await jsonGet(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`);
    const tarball = metadata.dist.tarball;
    await download(tarball, target);
  }

  protected extract(file: string, target: string): void {
    execSync(`tar -zxvf ${file} --strip-components=1 -C ${target}`);
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

    const metadata = await jsonGet(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`);
    const wheels: string[] = metadata.releases[pkg.version].filter((f: any) => f.url.endsWith('whl')).map((f: any) => f.url);

    if (wheels.length === 0) {
      throw new Error(`No wheels found for package ${pkg.name}-${pkg.version}`);
    }

    if (wheels.length > 1) {
      throw new Error(`Multiple wheels found for package ${pkg.name}-${pkg.version}: ${wheels.join(',')}`);
    }

    await download(wheels[0], target);
  }

  protected extract(artifact: string, target: string): void {
    execSync(`unzip ${artifact}`, { cwd: target });
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
  console.log(`Fetching: ${url}`);
  return get(url, (res, ok, ko) => {
    const json = jstream.parse(jsonPath);
    json.once('data', ok);
    json.once('error', ko);

    res.pipe(json, { end: true });
  }, { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' } });
}

export async function download(url: string, targetFile: string): Promise<any> {
  console.log(`Downloading: ${url}`);
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
