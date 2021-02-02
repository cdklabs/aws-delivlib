import '@monocdk-experiment/assert/jest';
import { App, Stack } from 'monocdk';
import { AutoBuild, GitHubRepo } from '../lib';

test('webhooks are enabled by default', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
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
test('can disable webhooks', () => {
  const app = new App();
  const stack = new Stack(app, 'Stack');
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