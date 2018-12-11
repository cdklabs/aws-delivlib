import cbuild = require('@aws-cdk/aws-codebuild');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import permissions = require('./permissions');
import { IPublisher } from './pipeline';
import { GitHubRepo } from './repo';
import { LinuxPlatform, Shellable } from './shellable';
import { SigningKey } from './signing-key';

export interface PublishToMavenProjectProps {
  /**
   * The signing key itself
   */
  signingKey: SigningKey;

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
      environmentVariables: {
        STAGING_PROFILE_ID: { value: props.stagingProfileId },
        SIGNING_KEY_SCOPE: { value: props.signingKey.scope },
        FOR_REAL: { value: forReal },
        MAVEN_LOGIN_SECRET: { value: props.mavenLoginSecret.secretArn }
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.mavenLoginSecret, shellable.role);
      props.signingKey.grantRead(shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
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
      environmentVariables: {
        FOR_REAL: { value: forReal },
        NPM_TOKEN_SECRET: { value: props.npmTokenSecret.secretArn }
      },
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.npmTokenSecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
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
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NuGet
 */
export class PublishToNuGetProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishToNuGetProjectProps) {
    super(parent, id);

    const env: { [key: string]: cbuild.BuildEnvironmentVariable } = { };

    env.FOR_REAL = { value: props.dryRun === undefined ? 'false' : (!props.dryRun).toString() };

    if (props.nugetApiKeySecret.assumeRoleArn) {
      env.NUGET_ROLE_ARN = { value: props.nugetApiKeySecret.assumeRoleArn };
    }

    if (props.nugetApiKeySecret.region) {
      env.NUGET_SECRET_REGION = { value: props.nugetApiKeySecret.region };
    } else {
      env.NUGET_SECRET_REGION = { value: new cdk.AwsRegion() };
    }

    env.NUGET_SECRET_ID = { value: props.nugetApiKeySecret.secretArn };

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_DOTNET_CORE_2_1),
      scriptDirectory: path.join(__dirname, 'publishing', 'nuget'),
      entrypoint: 'publish.sh',
      environmentVariables: env,
    });

    if (shellable.role) {
      if (props.nugetApiKeySecret.assumeRoleArn) {
        permissions.grantAssumeRole(props.nugetApiKeySecret.assumeRoleArn, shellable.role);
      } else {
        permissions.grantSecretRead(props.nugetApiKeySecret, shellable.role);
      }
    }

    this.role = shellable.role;
    this.project = shellable.project;
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
}

/**
 * CodeBuild project that will publish all packages in a release bundle to NuGet
 */
export class PublishDocsToGitHubProject extends cdk.Construct implements IPublisher {
  public role?: iam.Role;
  public readonly project: cbuild.Project;

  constructor(parent: cdk.Construct, id: string, props: PublishDocsToGitHubProjectProps) {
    super(parent, id);

    const forReal = { value: props.dryRun === undefined ? 'false' : (!props.dryRun).toString() };

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'docs'),
      entrypoint: 'publish.sh',
      environmentVariables: {
        // Must be SSH because we use an SSH key to authenticate
        GITHUB_REPO: { value: `git@github.com:${props.githubRepo.owner}/${props.githubRepo.repo}` },
        SSH_KEY_SECRET: { value: props.sshKeySecret.secretArn },
        FOR_REAL: forReal,
        COMMIT_USERNAME: { value: props.commitUsername },
        COMMIT_EMAIL: { value: props.commitEmail },
        BUILD_MANIFEST: { value: props.buildManifestFileName || './build.json' },
      }
    });

    if (shellable.role) {
      permissions.grantSecretRead(props.sshKeySecret, shellable.role);
    }

    this.role = shellable.role;
    this.project = shellable.project;
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
  signingKey: SigningKey;

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

    const forReal = { value: props.dryRun === undefined ? 'false' : (!props.dryRun).toString() };
    const oauth = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: props.githubRepo.tokenParameterName });

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(cbuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0),
      scriptDirectory: path.join(__dirname, 'publishing', 'github'),
      entrypoint: 'publish.sh',
      environmentVariables: {
        BUILD_MANIFEST: { value: props.buildManifestFileName || './build.json' },
        CHANGELOG: { value: props.changelogFileName || './CHANGELOG.md' },
        SIGNING_KEY_SCOPE: { value: props.signingKey.scope },
        GITHUB_TOKEN: { value: oauth.value },
        GITHUB_OWNER: { value: props.githubRepo.owner },
        GITHUB_REPO: { value: props.githubRepo.repo },
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
}