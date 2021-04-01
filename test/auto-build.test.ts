import '@monocdk-experiment/assert/jest';
import { App, Stack } from 'monocdk';
import { AutoBuild, GitHubRepo } from '../lib';

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

  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
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

  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
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

  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
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

  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false,
    },
  });
});