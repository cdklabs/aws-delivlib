import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { ICodeSigningCertificate } from './code-signing';
import { OpenPGPKeyPair } from './open-pgp-key-pair';
import permissions = require('./permissions');
import { AddToPipelineOptions, IPublisher } from './pipeline';
import { GitHubRepo } from './repo';
import { LinuxPlatform, Shellable } from './shellable';

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
}

/**
 * CodeBuild project that will publish all packages in a release bundle to Maven
 */
export class PublishToMavenProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishToMavenProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'maven'),
      entrypoint: 'publish.sh',
      environment: {
        STAGING_PROFILE_ID: props.stagingProfileId,
        SIGNING_KEY_ARN: props.signingKey.credential.secretArn,
        FOR_REAL: forReal,
        MAVEN_LOGIN_SECRET: props.mavenLoginSecret.secretArn
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.mavenLoginSecret, shellable.role);
      props.signingKey.grantRead(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
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
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NPM
 */
export class PublishToNpmProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishToNpmProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'npm'),
      entrypoint: 'publish.sh',
      environment: {
        FOR_REAL: forReal,
        NPM_TOKEN_SECRET: props.npmTokenSecret.secretArn
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.npmTokenSecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
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
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NuGet
 */
export class PublishToNuGetProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishToNuGetProjectProps) {
    super(parent, id);

    const environment: { [key: string]: string } = { };

    environment.FOR_REAL = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    if (props.nugetApiKeySecret.assumeRoleArn) {
      environment.NUGET_ROLE_ARN = props.nugetApiKeySecret.assumeRoleArn;
    }

    if (props.nugetApiKeySecret.region) {
      environment.NUGET_SECRET_REGION = props.nugetApiKeySecret.region;
    } else {
      environment.NUGET_SECRET_REGION = cdk.Stack.find(this).region;
    }

    environment.NUGET_SECRET_ID = props.nugetApiKeySecret.secretArn;

    if (props.codeSign) {
      environment.CODE_SIGNING_SECRET_ID = props.codeSign.credential.secretArn;
      environment.CODE_SIGNING_PARAMETER_NAME = props.codeSign.principal.parameterName;
    }

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_DOTNET_CORE_2_1),
      scriptDirectory: path.join(__dirname, 'publishing', 'nuget'),
      entrypoint: 'publish.sh',
      environment,
    });

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

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
  }
}

export interface PublishDocsToGitHubProjectProps {
  /**
   * The repository to publish to
   */
  githubRepo: GitHubRepo;

  /**
   * Secret with the private SSH key to write to GitHub.
   * The secret should be stored as plain text.
   * (Public counterpart should be added to Deploy Keys on GitHub repository)
   */
  sshKeySecret: permissions.ExternalSecret;

  /**
   * The username to use for the published commits
   */
  commitUsername: string;

  /**
   * The email address to use for the published commits
   */
  commitEmail: string;

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
export class PublishDocsToGitHubProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishDocsToGitHubProjectProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'docs'),
      entrypoint: 'publish.sh',
      environment: {
        // Must be SSH because we use an SSH key to authenticate
        GITHUB_REPO: `git@github.com:${props.githubRepo.owner}/${props.githubRepo.repo}`,
        GITHUB_PAGES_BRANCH: props.branch || 'gh-pages',
        SSH_KEY_SECRET: props.sshKeySecret.secretArn,
        FOR_REAL: forReal,
        COMMIT_USERNAME: props.commitUsername,
        COMMIT_EMAIL: props.commitEmail,
        BUILD_MANIFEST: props.buildManifestFileName || './build.json',
      }
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.sshKeySecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
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
  githubRepo: GitHubRepo;

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
}

export class PublishToGitHub extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishToGitHubProps) {
    super(parent, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();
    const oauth = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: props.githubRepo.tokenParameterName });

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'github'),
      entrypoint: 'publish.sh',
      environment: {
        BUILD_MANIFEST: props.buildManifestFileName || './build.json',
        CHANGELOG: props.changelogFileName || './CHANGELOG.md',
        SIGNING_KEY_ARN: props.signingKey.credential.secretArn,
        GITHUB_TOKEN: oauth.value.toString(),
        GITHUB_OWNER: props.githubRepo.owner,
        GITHUB_REPO: props.githubRepo.repo,
        FOR_REAL: forReal,
      }
    });

    // allow script to read the signing key
    if (shellable.role) {
      props.signingKey.grantRead(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
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

export class PublishToS3 extends cdk.Construct implements IPublisher {
  public readonly role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(scope: cdk.Construct, id: string, props: PublishToS3Props) {
    super(scope, id);

    const forReal = props.dryRun === undefined ? 'false' : (!props.dryRun).toString();

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_BASE),
      scriptDirectory: path.join(__dirname, 'publishing', 's3'),
      entrypoint: 'publish.sh',
      environment: {
        BUCKET_URL: `s3://${props.bucket.bucketName}`,
        CHANGELOG: props.public ? 'true' : 'false',
        FOR_REAL: forReal,
      }
    });

    // Allow script to write to bucket
    if (shellable.role) {
      props.bucket.grantReadWrite(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void {
    this.project.addToPipeline(stage, id, options);
  }
}