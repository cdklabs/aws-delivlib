// tslint:disable: max-line-length
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AutoPullRequest, WritableGitHubRepo } from '../../lib';

const MOCK_REPO = new WritableGitHubRepo({
  sshKeySecret: { secretArn: 'ssh-key-secret-arn' },
  commitUsername: 'user',
  commitEmail: 'email@email',
  repository: 'owner/repo',
  tokenSecretArn: 'token-secret-arn',
});


let app: cdk.App;
let stack: cdk.Stack;

beforeEach(() => {
  app = new cdk.App();
  stack = new cdk.Stack(app, 'TestStack');
});

test('skip PR if still open', () => {
  // WHEN
  new AutoPullRequest(stack, 'AutoPull', {
    repo: MOCK_REPO,
    head: { name: 'new-feature' },
    skipIfOpenPrsWithLabels: ['asdf'],
  });
  const template = Template.fromStack(stack);

  // THEN
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          build: {
            commands: Match.arrayWith([
              '$SKIP || { export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id "token-secret-arn" --output=text --query=SecretString) ; }',
              '$SKIP || { curl --fail -o search.json --header "Authorization: token $GITHUB_TOKEN" --header "Content-Type: application/json" \'https://api.github.com/search/issues?q=repo%3Aowner%2Frepo%20is%3Apr%20is%3Aopen%20label%3Aasdf\' ; }',
              '$SKIP || { node -e \'process.exitCode = require("./search.json").total_count\' || { echo "Found open PRs with label asdf, skipping PR."; export SKIP=true; } ; }',
            ]),
          },
        }),
      }),
    },
  });
});
