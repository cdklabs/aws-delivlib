import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as AWS from 'aws-sdk';

/**
 * Properties for `Repository`.
 */
export interface RepositoryProps {
  /**
   * Local directory where the repository was cloned to.
   */
  readonly repoDir: string;
}

/**
 * Artifact produced by this repository.
 */
export interface Artifact {
  /**
   * Language of the artifact.
   */
  readonly lang: string;

  /**
   * Directory containing the artifact.
   */
  readonly directory: string;
}

/**
 * Options for `Repository.fromGitHub`
 */
export interface RepositoryFromGitHubOptions {

  /**
   * Repository slug (e.g cdk8s-team/cdk8s-core)
   */
  readonly slug: string;

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
   * ARN of an AWS secrets manager secret containing a GitHub token.
   * Required for private repositories. Recommended for public ones, to avoid throtlling issues.
   *
   * @default - the repository is cloned without credentials.
   */
  readonly githubTokenSecretArn?: string;

}

/**
 * Options for `Repository.fromDir`
 */
export interface RepositoryFromDirOptions {

  /**
   * The directory of the repo.
   */
  readonly repoDir: string;

}

/**
 * Repository containing a node project.
 */
export class Repository {

  /**
   * Create a repository from a local directory.
   */
  public static async fromDir(options: RepositoryFromDirOptions): Promise<Repository> {
    return new Repository(options.repoDir);
  }

  /**
   * Create a repository from a GitHub repository.
   */
  public static async fromGitHub(options: RepositoryFromGitHubOptions): Promise<Repository> {

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'work'));
    const sm = new AWS.SecretsManager();

    let token = undefined;
    if (options.githubTokenSecretArn) {
      const secret = await sm.getSecretValue({ SecretId: options.githubTokenSecretArn }).promise();
      token = secret.SecretString;
    }
    const repoDir = fs.mkdtempSync(path.join(workdir, 'repo'));

    console.log(`Cloning ${options.slug} into ${repoDir}`);
    execSync(`git clone https://${token ? `${token}@` : ''}github.com/${options.slug}.git ${repoDir}`);

    const latestTag = findLatestTag(repoDir, options.tagPrefix);
    execSync(`git checkout ${latestTag}`, { cwd: repoDir });

    return new Repository(repoDir);

  }

  private readonly isJsii: boolean;
  private readonly manifest: any;

  private constructor(public readonly repoDir: string) {
    const manifestPath = path.join(repoDir, 'package.json');

    this.manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf-8' }));

    const isProjen = fs.existsSync(path.join(repoDir, '.projen'));
    const isYarn = fs.existsSync(path.join(repoDir, 'yarn.lock'));

    if (!isProjen) {
      // this makes packing much simpler since projen standrardizes it.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only projen managed repositories are supported at this time');
    }

    if (!isYarn) {
      // the projen version we use has to match the one in the repo since otherwise
      // synthesis may result in a diff. so we use and enforce a yarn.lock file
      // to make it simpler and not have to worry about other package managers.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only yarn managed repositories are supported at this time');
    }

    this.isJsii = !!this.manifest.jsii;
  }

  /**
   * Pack the repository to produce the artifacts.
   */
  public pack(command: string): Artifact[] {

    const installCommand = 'yarn install --frozen-lockfile';
    console.log(`Installing | ${installCommand}`);
    this._shell(installCommand);

    const dist = this.isJsii ? this.manifest.jsii.outdir ?? 'dist' : 'dist';
    const outdir = path.join(this.repoDir, dist);

    console.log(`Packing | ${command}`);

    // crapy: https://github.com/projen/projen/pull/1631
    this._shell(this.isJsii ? `unset CI && ${command}` : command);

    const artifacts: Artifact[] = [];
    for (const lang of fs.readdirSync(outdir)) {
      const langDir = path.join(outdir, lang);
      if (!fs.lstatSync(langDir).isDirectory()) {
        // dist folder may contain files such as changelog.md
        // so we ignore these
        continue;
      }
      artifacts.push({ lang, directory: path.join(outdir, lang) });
    }

    return artifacts;

  }

  private _shell(command: string) {
    execSync(command, { cwd: this.repoDir, stdio: ['ignore', 'inherit', 'inherit'] });
  }

}

function findLatestTag(repoDir: string, prefix?: string) {
  const tags = execSync(`git tag -l --sort=-creatordate "${prefix ?? ''}*"`, { cwd: repoDir }).toString();
  return tags.split(os.EOL)[0].trim();
}
