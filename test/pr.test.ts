// tslint:disable: max-line-length
import { annotateMatcher, encodedJson, InspectionFailure, matcherFrom, objectLike, PropertyMatcher } from '@monocdk-experiment/assert';
import '@monocdk-experiment/assert/jest';
import * as cdk from 'monocdk';
import { AutoPullRequest, WritableGitHubRepo } from '../lib';

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

  // THEN
  expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: encodedJson({
        version: '0.2',
        phases: objectLike({
          build: {
            commands: containsSlice([
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

export function containsSlice(elements: any[]): PropertyMatcher {
  return annotateMatcher({ $containsSlice: elements }, (value: any, failure: InspectionFailure) => {
    if (!Array.isArray(value)) {
      failure.failureReason = `Expected an Array, but got '${typeof value}'`;
      return false;
    }

    const innerMatchers = elements.map(matcherFrom);

    for (let i = 0; i < value.length - elements.length; i++) {

      const innerInspection = { ...failure, failureReason: '' };
      let success = true;
      for (let j = 0; success && j < innerMatchers.length; j++) {
        success = innerMatchers[j](value[i + j], innerInspection);
      }

      if (success) {
        return true;
      }
    }

    failure.failureReason = 'Array did not contain expected elements';
    return false;
  });
}
