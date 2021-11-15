import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
   * Download a package to the target directory.
   *
   * @param pkg The package to download.
   * @param target The directory to download to.
   */
  protected abstract download(pkg: PublishedPackage, target: string): void;

  /**
   * Extract the artifact into the target directory.
   *
   * @param artifact Path to an artifact file.
   * @param target The directory to extract do.
   */
  protected abstract extract(artifact: string, target: string): void;

  /**
   * Parse a local artifact file name into a structured package.
   *
   * @param artifactName Base name of the local artifact file.
   * @returns The package this artifact correlates to.
   */
  protected abstract parse(artifactName: string): PublishedPackage;

  /**
   * The file extenstion of artifacts produced for this check. (e.g 'whl')
   */
  protected abstract get ext(): string;

  /**
   * Validate a local artifact against its published counterpart.
   *
   * @param localArtifactDir The directory of the local artifact. Must contain exactly one file with the appropriate extenstion.
   */
  public validate(localArtifactDir: string) {

    const artifactPath = this.findOne(localArtifactDir);
    const name = this.constructor.name;

    console.log(`Running ${name} on ${artifactPath}`);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-check'));

    try {
      const downloaded = path.join(workdir, `${name}.downloaded`);
      const published = path.join(workdir, `${name}.published`);
      const local = path.join(workdir, `${name}.local`);

      // parse the artifact name into a package.
      const pkg = this.parse(path.basename(artifactPath));

      fs.mkdirSync(downloaded);
      fs.mkdirSync(published);
      fs.mkdirSync(local);

      // download the package
      this.download(pkg, downloaded);

      // extract the downlaoded package
      this.extract(this.findOne(downloaded), published);

      // extract the local artfiact
      this.extract(artifactPath, local);

      console.log(`Validating diff between ${local} and ${published}`);
      execSync(`diff ${local} ${published}`, { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log('Success');

    } finally {
      execSync(`rm -rf ${workdir}`);
    }

  }

  private findOne(dir: string): string {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(this.ext));
    if (files.length === 0) {
      throw new Error(`No files found in ${dir}`);
    }
    if (files.length > 1) {
      throw new Error(`Multiple files found in ${dir}`);
    }
    return path.join(dir, files[0]);
  }

}

/**
 * Properties for `RepositoryIntegrity`.
 */
export interface RepositoryIntegrityProps {
  /**
   * ARN of an AWS secrets manager secret containing a GitHub token.
   */
  readonly githubTokenSecretArn: string;

  /**
   * Repository slug (e.g cdk8s-team/cdk8s-core)
   */
  readonly repository: string;

  /**
   * Repository tag.
   *
   * @default - latest tag.
   */
  readonly tag?: string;

  /**
   * Prefix for detecting the latest tag of the repo. Only applies if `tag` isn't specified.
   * This is useful for repositories that produce multiple packages, and hence multiple tags
   * for example: https://github.com/cdk8s-team/cdk8s-plus/tags.
   */
  readonly tagPrefix?: string;
}

/**
 * Integrity class for validating the artifacts produced by this repository against their published counterparts.
 */
export class RepositoryIntegrity {

  constructor(private readonly props: RepositoryIntegrityProps) {}

  /**
   * Validate the artifacts of this repo against its published counterpart.
   */
  public validate() {

    const repo = this.clone();
    const artifacts = repo.pack();

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
        integrity.validate(artifact.directory);
      }
    }
    console.log('Validation done');
  }

  private clone(): Repository {

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'work'));
    const token = execSync(`aws secretsmanager get-secret-value --secret-id ${this.props.githubTokenSecretArn} --output=text --query=SecretString`, { encoding: 'utf-8' }).toString().trim();
    const repoDir = fs.mkdtempSync(path.join(workdir, 'repo'));

    console.log(`Cloning ${this.props.repository} into ${repoDir}`);
    execSync(`git clone https://${token}@github.com/${this.props.repository}.git ${repoDir}`);

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

  protected get ext(): string {
    return 'tgz';
  }

  protected download(pkg: PublishedPackage, target: string): void {
    execSync(`npm pack ${pkg.name}@${pkg.version}`, { cwd: target });
  }

  protected extract(file: string, target: string): void {
    execSync(`tar -zxvf ${file} --strip-components=1 -C ${target}`);
  }

  protected parse(artifactName: string): PublishedPackage {

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

  protected get ext(): string {
    return 'whl';
  }

  protected download(pkg: PublishedPackage, target: string): void {
    execSync(`pip download --no-deps ${pkg.name}==${pkg.version}`, { cwd: target });
  }

  protected extract(artifact: string, target: string): void {
    execSync(`unzip ${artifact}`, { cwd: target });
  }

  protected parse(artifactName: string): PublishedPackage {

    // cdk8s-1.0.0b63-py3-none-any.whl
    const regex = /(.*)-v?(\d.*)-py.*.whl/;

    const match = artifactName.match(regex);
    if (!match) {
      throw new Error(`Unable to parse artifact: ${artifactName}`);
    }

    return { name: match[1], version: match[2] };

  }

}