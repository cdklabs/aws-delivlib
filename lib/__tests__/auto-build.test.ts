import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Artifacts } from 'aws-cdk-lib/aws-codebuild';
import { AutoBuild, GitHubRepo } from '../../lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';

let app: App;
let stack: Stack;
beforeEach(() => {
  app = new App();
  stack = new Stack(app, 'Stack');
});

test('webhooks are enabled by default', () => {
  new AutoBuild(stack, 'AutoBuild', {
    repo: new GitHubRepo({
      repository: 'some-repo',
      tokenSecretArn: 'arn:aws:secretsmanager:someregion:someaccount:secret:sometoken',
    }),
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Triggers: {
      FilterGroups: [
        [
          {
            Pattern: 'PUSH, PULL_REQUEST_CREATED, PULL_REQUEST_UPDATED',
            Type: 'EVENT',
          },
        ],
      ],
      Webhook: true,
    },
  });
});

test('webhooks for a single branch', () => {
  new AutoBuild(stack, 'AutoBuild', {
    repo: new GitHubRepo({
      repository: 'some-repo',
      tokenSecretArn: 'arn:aws:secretsmanager:someregion:someaccount:secret:sometoken',
    }),
    branch: 'banana',
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Triggers: {
      FilterGroups: [
        [
          {
            Pattern: 'PUSH',
            Type: 'EVENT',
          },
          {
            Pattern: '^refs/heads/banana$',
            Type: 'HEAD_REF',
          },
        ],
        [
          {
            Pattern: 'PULL_REQUEST_CREATED, PULL_REQUEST_UPDATED',
            Type: 'EVENT',
          },
          {
            Pattern: '^refs/heads/banana$',
            Type: 'BASE_REF',
          },
        ],
      ],
      Webhook: true,
    },
  });
});

test('webhooks for multiple branches', () => {
  new AutoBuild(stack, 'AutoBuild', {
    repo: new GitHubRepo({
      repository: 'some-repo',
      tokenSecretArn: 'arn:aws:secretsmanager:someregion:someaccount:secret:sometoken',
    }),
    branches: ['banana', 'grapefruit'],
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Triggers: {
      FilterGroups: [
        [
          {
            Pattern: 'PUSH',
            Type: 'EVENT',
          },
          {
            Pattern: '^refs/heads/banana$|^refs/heads/grapefruit$',
            Type: 'HEAD_REF',
          },
        ],
        [
          {
            Pattern: 'PULL_REQUEST_CREATED, PULL_REQUEST_UPDATED',
            Type: 'EVENT',
          },
          {
            Pattern: '^refs/heads/banana$|^refs/heads/grapefruit$',
            Type: 'BASE_REF',
          },
        ],
      ],
      Webhook: true,
    },
  });
});

test('can disable webhooks', () => {
  new AutoBuild(stack, 'AutoBuild', {
    repo: new GitHubRepo({
      repository: 'some-repo',
      tokenSecretArn: 'arn:aws:secretsmanager:someregion:someaccount:secret:sometoken',
    }),
    webhook: false,
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false,
    },
  });
});

test('can enable artifacts', () => {
  new AutoBuild(stack, 'AutoBuild', {
    repo: new GitHubRepo({
      repository: 'some-repo',
      tokenSecretArn: 'arn:aws:secretsmanager:someregion:someaccount:secret:sometoken',
    }),
    artifacts: Artifacts.s3({
      bucket: new Bucket(stack, 'artifactBucket'),
      name: 'artifact-name',
    }),
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Artifacts: {
      Location: { Ref: 'artifactBucket27548F83' },
      Name: 'artifact-name',
      NamespaceType: 'BUILD_ID',
      Packaging: 'ZIP',
      Type: 'S3',
    },
  });
});
