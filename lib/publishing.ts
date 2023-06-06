import * as path from 'path';
import {
  Stack,
  aws_codebuild as cbuild,
  aws_codepipeline as cpipeline,
  aws_codepipeline_actions as cpipeline_actions,
  aws_iam as iam,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ICodeSigningCertificate } from './code-signing';
import { OpenPGPKeyPair } from './open-pgp-key-pair';
import * as permissions from './permissions';
import { AddToPipelineOptions, IPublisher } from './pipeline';
import { WritableGitHubRepo } from './repo';
import { LinuxPlatform, Shellable } from './shellable';
import { noUndefined } from './util';

/**
 * Type of access permissions to request from npmjs.
 */
export enum NpmAccess {
  /**
   * No access restriction. Note that unscoped packages must always be public.
   */
  PUBLIC = 'public',

  /**
   * Limit access to whitelisted npmjs users.
   */
  RESTRICTED = 'restricted',
}

export interface PublishToMavenProjectProps {
  /**
   * The signing key itself
   */
  signingKey: OpenPGPKeyPair;

  /**
   * The ID of the sonatype staging profile (e.g. "68a05363083174").
   */
  stagingProfileId: string;

  /**
   * Identifier of the secret that contains the Maven login
   */
  mavenLoginSecret: permissions.ExternalSecret;

  /**
   * If true (default) performs a dry-run only instead of actually publishing.
   * @default true
   */
  dryRun?: boolean;

  /**
   * The Maven publishing endpoint to be used.
   *
   * @default "https://oss.sonatype.org"
   */
  mavenEndpoint?: string;

  /**
   * The build image to do the publishing in
   *
   * Needs to have Maven preinstalled.
   *
   * @default Latest superchain
   */
  readonly buildImage?: cbuild.IBuildImage;
}

/**
 * CodeBuild project that will publish all packages in a release bundle to Maven
 */
export class PublishToMavenProject extends Construct implements IPublisher {
  public readonly role: iam.IRole;
  public readonly project: cbuild.Project;

  constructor(parent: Construct, id: string, props: PublishToMavenProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(props.buildImage ?? cbuild.LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-buster-slim-node18')),
      scriptDirectory: path.join(__dirname, 'publishing', 'maven'),
      entrypoint: 'publish.sh',
      environment: {
        STAGING_PROFILE_ID: props.stagingProfileId,
        SIGNING_KEY_ARN: props.signingKey.credential.secretArn,
        FOR_REAL: forReal,
        MAVEN_LOGIN_SECRET: props.mavenLoginSecret.secretArn,
        MAVEN_ENDPOINT: props.mavenEndpoint || 'https://oss.sonatype.org',
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.mavenLoginSecret, shellable.role);
      props.signingKey.grantRead(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishToNpmProjectProps {
  /**
   * Identifier of the secret that contains the NPM token
   */
  npmTokenSecret: permissions.ExternalSecret;

  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;

  /**
   * npm dist-tag to use when publishing artifacts.
   *
   * @default - npm default behavior ("latest" unless dist tag is specified in package.json)
   */
  distTag?: string;

  /**
   * npm --access public|restricted
   *
   * See https://docs.npmjs.com/cli-commands/publish#:~:text=Tells%20the
   *
   * Tells the registry whether this package should be published as public or restricted.
   * Only applies to scoped packages, which default to restricted.
   * If you don’t have a paid account, you must publish with --access public to publish scoped packages.
   *
   * @default NpmAccess.PUBLIC
   */
  access?: NpmAccess;
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NPM
 */
export class PublishToNpmProject extends Construct implements IPublisher {
  public readonly role?: iam.IRole;
  public readonly project: cbuild.Project;

  constructor(parent: Construct, id: string, props: PublishToNpmProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const access = props.access ?? NpmAccess.PUBLIC;

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'npm'),
      entrypoint: 'publish.sh',
      environment: {
        FOR_REAL: forReal,
        NPM_TOKEN_SECRET: props.npmTokenSecret.secretArn,
        DISTTAG: props.distTag || '',
        ACCESS: access,
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.npmTokenSecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishToNuGetProjectProps {
  /**
   * The SecretsManager secret which stores the Nuget API key.
   */
  nugetApiKeySecret: permissions.ExternalSecret;

  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;

  /**
   * A code signing certificate to use to sign assemblies.
   * @default No signing
   */
  codeSign?: ICodeSigningCertificate;

  /**
   * The build image to do the publishing in
   *
   * Needs to have NuGet preinstalled.
   *
   * @default Latest superchain
   */
  readonly buildImage?: cbuild.IBuildImage;
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NuGet
 */
export class PublishToNuGetProject extends Construct implements IPublisher {
  public readonly role: iam.IRole;
  public readonly project: cbuild.Project;

  constructor(parent: Construct, id: string, props: PublishToNuGetProjectProps) {
    super(parent, id);

    const environment: { [key: string]: string } = {};

    environment.FOR_REAL = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    if (props.nugetApiKeySecret.assumeRoleArn) {
      environment.NUGET_ROLE_ARN = props.nugetApiKeySecret.assumeRoleArn;
    }

    if (props.nugetApiKeySecret.region) {
      environment.NUGET_SECRET_REGION = props.nugetApiKeySecret.region;
    } else {
      environment.NUGET_SECRET_REGION = Stack.of(this).region;
    }

    environment.NUGET_SECRET_ID = props.nugetApiKeySecret.secretArn;

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(props.buildImage ?? cbuild.LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-buster-slim-node18')),
      scriptDirectory: path.join(__dirname, 'publishing', 'nuget'),
      entrypoint: 'publish.sh',
      environment,
    });

    if (props.codeSign) {
      environment.CODE_SIGNING_SECRET_ID = props.codeSign.credential.secretArn;
      environment.CODE_SIGNING_PARAMETER_NAME = props.codeSign.principal.parameterName;
    }

    if (shellable.role) {
      if (props.nugetApiKeySecret.assumeRoleArn) {
        permissions.grantAssumeRole(props.nugetApiKeySecret.assumeRoleArn, shellable.role);
      } else {
        permissions.grantSecretRead(props.nugetApiKeySecret, shellable.role);
      }

      if (props.codeSign) {
        props.codeSign.grantDecrypt(shellable.role);
      }
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishDocsToGitHubProjectProps {
  /**
   * The repository to publish to
   */
  githubRepo: WritableGitHubRepo;

  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;

  /**
   * The name of the build manifest JSON file (must include "name" and "version" fields).
   * Relative to the artifacts root.
   * @default "./build.json"
   */
  buildManifestFileName?: string;

  /**
   * GitHub Pages branch to push to.
   * @default gh-pages
   */
  branch?: string;
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NuGet
 */
export class PublishDocsToGitHubProject extends Construct implements IPublisher {
  public readonly role: iam.IRole;
  public readonly project: cbuild.Project;

  constructor(parent: Construct, id: string, props: PublishDocsToGitHubProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'docs'),
      entrypoint: 'publish.sh',
      environment: {
        // Must be SSH because we use an SSH key to authenticate
        GITHUB_REPO: props.githubRepo.repositoryUrlSsh,
        GITHUB_PAGES_BRANCH: props.branch || 'gh-pages',
        SSH_KEY_SECRET: props.githubRepo.sshKeySecret.secretArn,
        FOR_REAL: forReal,
        COMMIT_USERNAME: props.githubRepo.commitUsername,
        COMMIT_EMAIL: props.githubRepo.commitEmail,
        BUILD_MANIFEST: props.buildManifestFileName || './build.json',
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.githubRepo.sshKeySecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishToGitHubProps {
  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;

  /**
   * The repository to create a release in.
   */
  githubRepo: WritableGitHubRepo;

  /**
   * The signign key to use to create a GPG signature of the artifact.
   */
  signingKey: OpenPGPKeyPair;

  /**
   * The name of the build manifest JSON file (must include "name" and "version" fields).
   * Relative to the artifacts root.
   * @default "./build.json"
   */
  buildManifestFileName?: string;

  /**
   * The name of the changelog markdown file, used to create release notes.
   * Relative to the artifacts root.
   * @default "./CHANGELOG.md"
   */
  changelogFileName?: string;

  /**
   * The name of the release notes file, containing the completed release notes
   * for the current release.
   * Relative to the artifacts root.
   * NOTE - If this value is set and points to a valid file, the file in its entirety
   * will be read and used for the release notes. The value of `changelogFileName` will
   * be ignored.
   * @default "./RELEASE_NOTES.md"
   */
  releaseNotesFileName?: string;

  /**
   * Additional input artifacts to publish binaries from to GitHub release
   */
  additionalInputArtifacts?: cpipeline.Artifact[];

  /**
   * Whether to sign the additional artifacts
   *
   * @default true
   */
  signAdditionalArtifacts?: boolean;
}

export class PublishToGitHub extends Construct implements IPublisher {
  public readonly role: iam.IRole;
  public readonly project: cbuild.Project;
  private readonly additionalInputArtifacts?: cpipeline.Artifact[];

  constructor(parent: Construct, id: string, props: PublishToGitHubProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();
    this.additionalInputArtifacts = props.additionalInputArtifacts;

    // The release notes, if set and a valid file, overrides any usages of the changelog.
    if (props.changelogFileName && props.releaseNotesFileName) {
      throw new Error('both `releaseNotesFileName` and `changelogFileName` cannot be specified; use one or the other');
    }

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'github'),
      entrypoint: 'publish.sh',
      environment: noUndefined({
        BUILD_MANIFEST: props.buildManifestFileName || './build.json',
        CHANGELOG: props.changelogFileName || './CHANGELOG.md',
        RELEASE_NOTES: props.releaseNotesFileName || './RELEASE_NOTES.md',
        SIGNING_KEY_ARN: props.signingKey.credential.secretArn,
        GITHUB_OWNER: props.githubRepo.owner,
        GITHUB_REPO: props.githubRepo.repo,
        FOR_REAL: forReal,
        // Transmit the names of the secondary sources to the shell script (for easier iteration)
        SECONDARY_SOURCE_NAMES: props.additionalInputArtifacts ? props.additionalInputArtifacts.map(a => a.artifactName).join(' ') : undefined,
        SIGN_ADDITIONAL_ARTIFACTS: props.additionalInputArtifacts && props.signAdditionalArtifacts !== false ? 'true' : undefined,
      }),
      environmentSecrets: {
        GITHUB_TOKEN: props.githubRepo.tokenSecretArn,
      },
    });

    // allow script to read the signing key
    if (shellable.role) {
      props.signingKey.grantRead(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      extraInputs: this.additionalInputArtifacts,
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishToS3Props {
  bucket: s3.IBucket;

  /**
   * Make files publicly readable
   *
   * @default false
   */
  public?: boolean;

  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;
}

export class PublishToS3 extends Construct implements IPublisher {
  public readonly role?: iam.IRole;
  public readonly project: cbuild.Project;

  constructor(scope: Construct, id: string, props: PublishToS3Props) {
    super(scope, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 's3'),
      entrypoint: 'publish.sh',
      environment: {
        BUCKET_URL: `s3://${props.bucket.bucketName}`,
        CHANGELOG: props.public ? 'true' : 'false',
        FOR_REAL: forReal,
      },
    });

    // Allow script to write to bucket
    if (shellable.role) {
      props.bucket.grantReadWrite(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

export interface PublishToPyPiProps {
  /**
   * Identifier of the secret that contains the PyPI credentials under
   * "username" and "password" keys.
   */
  loginSecret: permissions.ExternalSecret;

  /**
   * If `true` (default) will only perform a dry-run but will not actually publish.
   * @default true
   */
  dryRun?: boolean;
}

export class PublishToPyPi extends Construct {

  public readonly project: cbuild.Project;
  public readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props: PublishToPyPiProps) {
    super(scope, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'pypi'),
      entrypoint: 'publish.sh',
      environment: {
        FOR_REAL: forReal,
        PYPI_CREDENTIALS_SECRET_ID: props.loginSecret.secretArn,
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.loginSecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}

/**
 * Props for Go publishing.
 */
export interface PublishToGolangProps {
  /**
   * Identifier of the secret that contains the GitHub personal access token
   * used to push the go code to the github repository defined by it's name.
   *
   * @see https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
   */
  readonly githubTokenSecret: permissions.ExternalSecret;

  /**
   * Username to perform the commit with.
   */
  readonly gitUserName: string;

  /**
   * Email to perform the commit with.
   */
  readonly gitUserEmail: string;

  /**
   * Set to "true" for a dry run.
   * @default false
   */
  readonly dryRun?: boolean;

  /**
   * Module version.
   *
   * @default - Defaults to the value in the 'version' file of the module
   * directory. Fails if it doesn't exist.
   */
  readonly version?: string;

  /**
   * Branch to push to.
   *
   * @default "main"
   */
  readonly gitBranch?: string;

  /**
   * The commit message.
   *
   * @default "chore(release): $VERSION"
   */
  readonly gitCommitMessage?: string;
}

/**
 * Pushes a directory of golang modules to a GitHub repository.
 */
export class PublishToGolang extends Construct {
  public readonly project: cbuild.Project;
  public readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props: PublishToGolangProps) {
    super(scope, id);

    const dryRun = props.dryRun ?? false;

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.STANDARD_7_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'golang'),
      entrypoint: 'publish.sh',
      environment: {
        DRYRUN: dryRun ? 'true' : undefined,
        GITHUB_TOKEN_SECRET: props.githubTokenSecret.secretArn,
        VERSION: props.version,
        GIT_BRANCH: props.gitBranch,
        GIT_USER_NAME: props.gitUserName,
        GIT_USER_EMAIL: props.gitUserEmail,
        GIT_COMMIT_MESSAGE: props.gitCommitMessage,
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.githubTokenSecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}
