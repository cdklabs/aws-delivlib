import codebuild = require('@aws-cdk/aws-codebuild');
import serverless = require('@aws-cdk/aws-serverless');
import { Construct, Resource } from '@aws-cdk/cdk';
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
}

export interface AutoBuildProps extends AutoBuildOptions {
  /**
   * The repository to monitor.
   */
  readonly repo: IRepo;

  /**
   * Build environment.
   */
  readonly environment: BuildEnvironmentProps;

  /**
   * Build spec.
   */
  readonly buildSpec?: any;
}

export class AutoBuild extends Construct {
  constructor(scope: Construct, id: string, props: AutoBuildProps) {
    super(scope, id);

    const project = new codebuild.Project(this, 'Project', {
      source: props.repo.createBuildSource(this, true),
      environment: createBuildEnvironment(props.environment),
      badge: true,
      buildSpec: props.buildSpec
    });

    // not support in this version of the cdk
    const cfnProject = project.node.tryFindChild('Resource') as Resource;
    cfnProject.addPropertyOverride('Triggers', {
      Webhook: true,
      FilterGroups: [
        [ { Type: 'EVENT', Pattern: 'PUSH,PULL_REQUEST_CREATED,PULL_REQUEST_UPDATED' } ]
      ]
    });

    const publicLogs = props.publicLogs !== undefined ? props.publicLogs : false;
    if (publicLogs) {
      new serverless.CfnApplication(this, 'GitHubCodeBuildLogsSAR', {
        location: {
          applicationId: 'arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs',
          semanticVersion: '1.0.3'
        },
        parameters: {
          CodeBuildProjectName: project.projectName
        }
      });
    }
  }
}