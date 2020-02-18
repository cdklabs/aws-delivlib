import codebuild = require('@aws-cdk/aws-codebuild');
import serverless = require('@aws-cdk/aws-sam');
import { Construct, Token, SecretValue } from '@aws-cdk/core';
import { BuildEnvironmentProps, createBuildEnvironment } from './build-env';
import { IRepo } from './repo';

export interface AutoBuildOptions {
  /**
   * Make build logs public and publishes a link to GitHub PR discussion.
   *
   * @see https://github.com/jlhood/github-codebuild-logs
   *
   * @default false
   */
  readonly publicLogs?: boolean;

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
   * Build environment.
   */
  readonly environment: BuildEnvironmentProps;

  /**
   * The name of the CodeBuild project.
   *
   * @default - a name will be generated by CloudFormation.
   */
  readonly projectName?: string;

  /**
   * The specific branch to be considered for auto-builds.
   *
   * @default - any & all branches.
   */
  readonly branch?: string;
}

export class AutoBuild extends Construct {
  constructor(scope: Construct, id: string, props: AutoBuildProps) {
    super(scope, id);

    const project = new codebuild.Project(this, 'Project', {
      projectName: props.projectName,
      source: props.repo.createBuildSource(this, true, props.branch),
      environment: createBuildEnvironment(props.environment),
      badge: props.repo.allowsBadge,
      buildSpec: props.buildSpec
    });

    const publicLogs = props.publicLogs !== undefined ? props.publicLogs : false;
    const githubToken = props.repo.tokenSecretArn ? SecretValue.secretsManager(props.repo.tokenSecretArn) : undefined;

    if (publicLogs) {
      new serverless.CfnApplication(this, 'GitHubCodeBuildLogsSAR', {
        location: {
          applicationId: 'arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs',
          semanticVersion: '1.3.0'
        },
        parameters: {
          CodeBuildProjectName: project.projectName,
          ...githubToken ? { GitHubOAuthToken: Token.asString(githubToken)} : undefined,
        }
      });
    }
  }
}
