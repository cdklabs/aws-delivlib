// tslint:disable: max-line-length
import { core } from "monocdk-experiment";
import { AutoBump, WritableGitHubRepo } from "../lib";
import '@monocdk-experiment/assert/jest';

const Stack = core.Stack;

const MOCK_REPO = new WritableGitHubRepo({
  sshKeySecret: { secretArn: 'ssh-key-secret-arn' },
  commitUsername: 'user',
  commitEmail: 'email@email',
  repository: 'owner/repo',
  tokenSecretArn: 'token-secret-arn'
});

test('autoBump', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO
  });

  // THEN

  // build project
  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false
    },
    Source: {
      Type: 'GITHUB',
      GitCloneDepth: 0,
      Location: "https://github.com/owner/repo.git",
      ReportBuildStatus: false,
      BuildSpec: JSON.stringify({
        "version": "0.2",
        "phases": {
          "pre_build": {
            "commands": [
              "git config --global user.email \"email@email\"",
              "git config --global user.name \"user\""
            ]
          },
          "build": {
            "commands": [
              "git describe --exact-match HEAD && { echo \"No new commits.\"; export SKIP=true; } || { echo \"Changes to release.\"; export SKIP=false; }",
              "$SKIP || { /bin/sh ./bump.sh; }",
              "$SKIP || aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa",
              "$SKIP || mkdir -p ~/.ssh",
              "$SKIP || chmod 0600 ~/.ssh/id_rsa",
              "$SKIP || chmod 0600 ~/.ssh/config",
              "$SKIP || ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
              "$SKIP || { export VERSION=$(git describe) ; }",
              "$SKIP || { export BRANCH=bump/$VERSION ; }",
              "$SKIP || { git branch -D $BRANCH || true ; }",
              "$SKIP || { git checkout -b $BRANCH ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh $BRANCH ; }"
            ]
          }
        }
      }, undefined, 2)
    }
  });

  // default schedule
  expect(stack).toHaveResource('AWS::Events::Rule', {
    ScheduleExpression: "cron(0 12 * * ? *)"
  });
});

test('autoBump with custom cloneDepth', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO,
    cloneDepth: 10
  });

  // THEN

  // build project
  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false
    },
    Source: {
      Type: 'GITHUB',
      GitCloneDepth: 10,
      Location: "https://github.com/owner/repo.git",
      ReportBuildStatus: false,
      BuildSpec: JSON.stringify({
        "version": "0.2",
        "phases": {
          "pre_build": {
            "commands": [
              "git config --global user.email \"email@email\"",
              "git config --global user.name \"user\""
            ]
          },
          "build": {
            "commands": [
              "git describe --exact-match HEAD && { echo \"No new commits.\"; export SKIP=true; } || { echo \"Changes to release.\"; export SKIP=false; }",
              "$SKIP || { /bin/sh ./bump.sh; }",
              "$SKIP || aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa",
              "$SKIP || mkdir -p ~/.ssh",
              "$SKIP || chmod 0600 ~/.ssh/id_rsa",
              "$SKIP || chmod 0600 ~/.ssh/config",
              "$SKIP || ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
              "$SKIP || { export VERSION=$(git describe) ; }",
              "$SKIP || { export BRANCH=bump/$VERSION ; }",
              "$SKIP || { git branch -D $BRANCH || true ; }",
              "$SKIP || { git checkout -b $BRANCH ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh $BRANCH ; }"
            ]
          }
        }
      }, undefined, 2)
    }
  });
});

test('autoBump with schedule disabled', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO,
    scheduleExpression: 'disable'
  });

  // THEN
  expect(stack).not.toHaveResource('AWS::Events::Rule', {
    ScheduleExpression: "cron(0 12 * * ? *)"
  });
});

test('autoBump with pull request', () => {
  // GIVEN
  const stack = new Stack();
  const repo = new WritableGitHubRepo({
    sshKeySecret: { secretArn: 'ssh-key-secret-arn' },
    commitUsername: 'user',
    commitEmail: 'email@email',
    repository: 'owner/repo',
    tokenSecretArn: 'token-secret-arn'
  });

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo
  });

  // THEN

  // build project
  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false
    },
    Source: {
      Type: 'GITHUB',
      GitCloneDepth: 0,
      Location: "https://github.com/owner/repo.git",
      ReportBuildStatus: false,
      BuildSpec: JSON.stringify({
        "version": "0.2",
        "phases": {
          "pre_build": {
            "commands": [
              "git config --global user.email \"email@email\"",
              "git config --global user.name \"user\""
            ]
          },
          "build": {
            "commands": [
              "git describe --exact-match HEAD && { echo \"No new commits.\"; export SKIP=true; } || { echo \"Changes to release.\"; export SKIP=false; }",
              "$SKIP || { /bin/sh ./bump.sh; }",
              "$SKIP || aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa",
              "$SKIP || mkdir -p ~/.ssh",
              "$SKIP || chmod 0600 ~/.ssh/id_rsa",
              "$SKIP || chmod 0600 ~/.ssh/config",
              "$SKIP || ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
              "$SKIP || { export VERSION=$(git describe) ; }",
              "$SKIP || { export BRANCH=bump/$VERSION ; }",
              "$SKIP || { git branch -D $BRANCH || true ; }",
              "$SKIP || { git checkout -b $BRANCH ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh $BRANCH ; }",
              "$SKIP || { git diff --exit-code --no-patch $BRANCH master && { echo \"No changes after bump. Skipping pull request...\"; export SKIP=true; } || { echo \"Creating pull request...\"; export SKIP=false; } ; }",
              "$SKIP || { GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id \"token-secret-arn\" --output=text --query=SecretString) ; }",
              "$SKIP || { curl -X POST --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"title\\\":\\\"chore(release): $VERSION\\\",\\\"body\\\":\\\"see CHANGELOG\\\",\\\"base\\\":\\\"master\\\",\\\"head\\\":\\\"$BRANCH\\\"}\" https://api.github.com/repos/owner/repo/pulls ; }"
            ]
          }
        }
      }, undefined, 2)
    }
  });
});

test('autoBump with pull request with custom options', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO,

    // no need to specify pullRequest:true if we specify options
    title: 'custom title',
    body: 'custom body',
    base: {
      name: 'release'
    }
  });

  // THEN

  // build project
  expect(stack).toHaveResource('AWS::CodeBuild::Project', {
    Triggers: {
      Webhook: false
    },
    Source: {
      Type: 'GITHUB',
      GitCloneDepth: 0,
      Location: "https://github.com/owner/repo.git",
      ReportBuildStatus: false,
      BuildSpec: JSON.stringify({
        "version": "0.2",
        "phases": {
          "pre_build": {
            "commands": [
              "git config --global user.email \"email@email\"",
              "git config --global user.name \"user\""
            ]
          },
          "build": {
            "commands": [
              "git describe --exact-match HEAD && { echo \"No new commits.\"; export SKIP=true; } || { echo \"Changes to release.\"; export SKIP=false; }",
              "$SKIP || { /bin/sh ./bump.sh; }",
              "$SKIP || aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa",
              "$SKIP || mkdir -p ~/.ssh",
              "$SKIP || chmod 0600 ~/.ssh/id_rsa",
              "$SKIP || chmod 0600 ~/.ssh/config",
              "$SKIP || ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
              "$SKIP || { export VERSION=$(git describe) ; }",
              "$SKIP || { export BRANCH=bump/$VERSION ; }",
              "$SKIP || { git branch -D $BRANCH || true ; }",
              "$SKIP || { git checkout -b $BRANCH ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh $BRANCH ; }",
              "$SKIP || { git diff --exit-code --no-patch $BRANCH release && { echo \"No changes after bump. Skipping pull request...\"; export SKIP=true; } || { echo \"Creating pull request...\"; export SKIP=false; } ; }",
              "$SKIP || { GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id \"token-secret-arn\" --output=text --query=SecretString) ; }",
              "$SKIP || { curl -X POST --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"title\\\":\\\"custom title\\\",\\\"body\\\":\\\"custom body\\\",\\\"base\\\":\\\"release\\\",\\\"head\\\":\\\"$BRANCH\\\"}\" https://api.github.com/repos/owner/repo/pulls ; }"
            ]
          }
        }
      }, undefined, 2)
    }
  });
});

test('autoBump with pull request fails when head=base', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  expect(() => new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO,
    head: {
      name: 'master'
    },
    base: {
      name: 'master'
    }
  })).toThrow();
});
