import {
  Token, SecretValue,
  aws_codebuild as codebuild,
  aws_sam as serverless,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BuildEnvironmentProps, createBuildEnvironment } from './build-env';
import { IRepo } from './repo';

export interface AutoBuildOptions {
  /**
   * Build environment.
   * @default - see defaults in `BuildEnvironmentProps`
   */
  readonly environment?: BuildEnvironmentProps;

  /**
   * The name of the CodeBuild project.
   *
   * @default - a name will be generated by CloudFormation.
   */
  readonly projectName?: string;

  /**
   * Make build logs public and publishes a link to GitHub PR discussion.
   *
   * @see https://github.com/jlhood/github-codebuild-logs
   *
   * @default false
   */
  readonly publicLogs?: boolean;

  /**
   * Configure the project to respond to webhooks.
   *
   * @default true
   */
  readonly webhook?: boolean;

  /**
   * Whether to publish a link to build logs when build is successful.
   *
   * @see https://github.com/jlhood/github-codebuild-logs#app-parameters
   *
   * @default true
   */
  readonly publicLogsOnSuccess?: boolean;

  /**
   * Whether to delete previously published links to build logs
   * before posting a new one.
   *
   * @see https://github.com/jlhood/github-codebuild-logs#app-parameters
   *
   * @default true
   */
  readonly deletePreviousPublicLogsLinks?: boolean;

  /* tslint:disable:max-line-length */
  /**
   * Build spec file to use for AutoBuild
   *
   * @default @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-codebuild-project-source.html#cfn-codebuild-project-source-buildspec
   */
  readonly buildSpec?: codebuild.BuildSpec;
  /* tslint:enable:max-line-length */
}

export interface AutoBuildProps extends AutoBuildOptions {
  /**
   * The repository to monitor.
   *
   * Must be a GitHub repository for `publicLogs` to have any effect.
   */
  readonly repo: IRepo;

  /**
   * The specific branch to be considered for auto-builds.
   *
   * Specify at most one of `branch` and `branches`.
   *
   * @default - any & all branches.
   * @deprecated Use `branches` instead.
   */
  readonly branch?: string;

  /**
   * The specific branch to be considered for auto-builds.
   *
   * Specify at most one of `branch` and `branches`.
   *
   * @default - any & all branches.
   */
  readonly branches?: string[];
}

export class AutoBuild extends Construct {

  /**
   * The underlying `CodeBuild` project.
   */
  public readonly project: codebuild.Project;

  constructor(scope: Construct, id: string, props: AutoBuildProps) {
    super(scope, id);

    this.project = new codebuild.Project(this, 'Project', {
      projectName: props.projectName,
      source: props.repo.createBuildSource(this, props.webhook ?? true, { branch: props.branch, branches: props.branches }),
      environment: createBuildEnvironment(props.environment ?? {}),
      badge: props.repo.allowsBadge,
      buildSpec: props.buildSpec,
    });

    const publicLogs = props.publicLogs !== undefined ? props.publicLogs : false;
    const githubToken = props.repo.tokenSecretArn ? SecretValue.secretsManager(props.repo.tokenSecretArn) : undefined;

    if (publicLogs) {
      new serverless.CfnApplication(this, 'GitHubCodeBuildLogsSAR', {
        location: {
          applicationId: 'arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs',
          semanticVersion: '1.4.0',
        },
        parameters: {
          CodeBuildProjectName: this.project.projectName,
          DeletePreviousComments: (props.deletePreviousPublicLogsLinks ?? true).toString(),
          CommentOnSuccess: (props.publicLogsOnSuccess ?? true).toString(),
          ...githubToken ? { GitHubOAuthToken: Token.asString(githubToken) } : undefined,
        },
      });
    }
  }
}
