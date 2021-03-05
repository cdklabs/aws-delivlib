// tslint:disable: max-line-length
import * as core from "monocdk";
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
              "export SKIP=false",
              "$SKIP || { aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa ; }",
              "$SKIP || { mkdir -p ~/.ssh ; }",
              "$SKIP || { chmod 0600 ~/.ssh/id_rsa ; }",
              "$SKIP || { chmod 0600 ~/.ssh/config ; }",
              "$SKIP || { ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts ; }",
              "$SKIP || { ls .git && { echo \".git directory exists\";  } || { echo \".git directory doesnot exist - cloning...\" && git clone git@github.com:owner/repo.git /tmp/repo && mv /tmp/repo/.git . && git reset --hard master; } ; }",
              "$SKIP || { git describe --exact-match master && { echo 'Skip condition is met, skipping...' && export SKIP=true; } || { echo 'Skip condition is not met, continuing...' && export SKIP=false; } ; }",
              "$SKIP || { git rev-parse --verify origin/bump/$VERSION && { git checkout bump/$VERSION && git merge master && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands;  } || { git checkout master && git checkout -b temp && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands && git branch -m bump/$VERSION; } ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh bump/$VERSION ; }",
              "$SKIP || { git diff --exit-code --no-patch bump/$VERSION origin/master && { echo \"Skipping pull request...\"; export SKIP=true; } || { echo \"Creating pull request...\"; export SKIP=false; } ; }",
              "$SKIP || { export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id \"token-secret-arn\" --output=text --query=SecretString) ; }",
              "$SKIP || { curl --fail -X POST -o pr.json --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"title\\\":\\\"chore(release): $VERSION\\\",\\\"base\\\":\\\"master\\\",\\\"head\\\":\\\"bump/$VERSION\\\"}\" https://api.github.com/repos/owner/repo/pulls && export PR_NUMBER=$(node -p 'require(\"./pr.json\").number') ; }",
              "$SKIP || { curl --fail -X PATCH --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"body\\\":\\\"See [CHANGELOG](https://github.com/owner/repo/blob/bump/$VERSION/CHANGELOG.md)\\\"}\" https://api.github.com/repos/owner/repo/pulls/$PR_NUMBER ; }"
            ]
          }
        }
      }, undefined, 2)
    }
  });

});

test('autoBump with schedule', () => {

  const stack = new Stack();

  // WHEN
  new AutoBump(stack, 'MyAutoBump', {
    repo: MOCK_REPO,
    scheduleExpression: "cron(0 12 * * ? *)"
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
              "export SKIP=false",
              "$SKIP || { aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa ; }",
              "$SKIP || { mkdir -p ~/.ssh ; }",
              "$SKIP || { chmod 0600 ~/.ssh/id_rsa ; }",
              "$SKIP || { chmod 0600 ~/.ssh/config ; }",
              "$SKIP || { ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts ; }",
              "$SKIP || { ls .git && { echo \".git directory exists\";  } || { echo \".git directory doesnot exist - cloning...\" && git clone git@github.com:owner/repo.git /tmp/repo && mv /tmp/repo/.git . && git reset --hard master; } ; }",
              "$SKIP || { git describe --exact-match master && { echo 'Skip condition is met, skipping...' && export SKIP=true; } || { echo 'Skip condition is not met, continuing...' && export SKIP=false; } ; }",
              "$SKIP || { git rev-parse --verify origin/bump/$VERSION && { git checkout bump/$VERSION && git merge master && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands;  } || { git checkout master && git checkout -b temp && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands && git branch -m bump/$VERSION; } ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh bump/$VERSION ; }",
              "$SKIP || { git diff --exit-code --no-patch bump/$VERSION origin/master && { echo \"Skipping pull request...\"; export SKIP=true; } || { echo \"Creating pull request...\"; export SKIP=false; } ; }",
              "$SKIP || { export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id \"token-secret-arn\" --output=text --query=SecretString) ; }",
              "$SKIP || { curl --fail -X POST -o pr.json --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"title\\\":\\\"chore(release): $VERSION\\\",\\\"base\\\":\\\"master\\\",\\\"head\\\":\\\"bump/$VERSION\\\"}\" https://api.github.com/repos/owner/repo/pulls && export PR_NUMBER=$(node -p 'require(\"./pr.json\").number') ; }",
              "$SKIP || { curl --fail -X PATCH --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"body\\\":\\\"See [CHANGELOG](https://github.com/owner/repo/blob/bump/$VERSION/CHANGELOG.md)\\\"}\" https://api.github.com/repos/owner/repo/pulls/$PR_NUMBER ; }"
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

test('autoBump with push only', () => {
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
    repo,
    pushOnly: true
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
              "export SKIP=false",
              "$SKIP || { aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa ; }",
              "$SKIP || { mkdir -p ~/.ssh ; }",
              "$SKIP || { chmod 0600 ~/.ssh/id_rsa ; }",
              "$SKIP || { chmod 0600 ~/.ssh/config ; }",
              "$SKIP || { ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts ; }",
              "$SKIP || { ls .git && { echo \".git directory exists\";  } || { echo \".git directory doesnot exist - cloning...\" && git clone git@github.com:owner/repo.git /tmp/repo && mv /tmp/repo/.git . && git reset --hard master; } ; }",
              "$SKIP || { git describe --exact-match master && { echo 'Skip condition is met, skipping...' && export SKIP=true; } || { echo 'Skip condition is not met, continuing...' && export SKIP=false; } ; }",
              "$SKIP || { git rev-parse --verify origin/bump/$VERSION && { git checkout bump/$VERSION && git merge master && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands;  } || { git checkout master && git checkout -b temp && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands && git branch -m bump/$VERSION; } ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh bump/$VERSION ; }"
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
              "export SKIP=false",
              "$SKIP || { aws secretsmanager get-secret-value --secret-id \"ssh-key-secret-arn\" --output=text --query=SecretString > ~/.ssh/id_rsa ; }",
              "$SKIP || { mkdir -p ~/.ssh ; }",
              "$SKIP || { chmod 0600 ~/.ssh/id_rsa ; }",
              "$SKIP || { chmod 0600 ~/.ssh/config ; }",
              "$SKIP || { ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts ; }",
              "$SKIP || { ls .git && { echo \".git directory exists\";  } || { echo \".git directory doesnot exist - cloning...\" && git clone git@github.com:owner/repo.git /tmp/repo && mv /tmp/repo/.git . && git reset --hard master; } ; }",
              "$SKIP || { git describe --exact-match release && { echo 'Skip condition is met, skipping...' && export SKIP=true; } || { echo 'Skip condition is not met, continuing...' && export SKIP=false; } ; }",
              "$SKIP || { git rev-parse --verify origin/bump/$VERSION && { git checkout bump/$VERSION && git merge release && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands;  } || { git checkout release && git checkout -b temp && /bin/sh ./bump.sh && export VERSION=$(git describe) && echo Finished running user commands && git branch -m bump/$VERSION; } ; }",
              "$SKIP || { git remote add origin_ssh git@github.com:owner/repo.git ; }",
              "$SKIP || { git push --follow-tags origin_ssh bump/$VERSION ; }",
              "$SKIP || { git diff --exit-code --no-patch bump/$VERSION origin/release && { echo \"Skipping pull request...\"; export SKIP=true; } || { echo \"Creating pull request...\"; export SKIP=false; } ; }",
              "$SKIP || { export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id \"token-secret-arn\" --output=text --query=SecretString) ; }",
              "$SKIP || { curl --fail -X POST -o pr.json --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"title\\\":\\\"custom title\\\",\\\"base\\\":\\\"release\\\",\\\"head\\\":\\\"bump/$VERSION\\\"}\" https://api.github.com/repos/owner/repo/pulls && export PR_NUMBER=$(node -p 'require(\"./pr.json\").number') ; }",
              "$SKIP || { curl --fail -X PATCH --header \"Authorization: token $GITHUB_TOKEN\" --header \"Content-Type: application/json\" -d \"{\\\"body\\\":\\\"custom body\\\"}\" https://api.github.com/repos/owner/repo/pulls/$PR_NUMBER ; }"
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
    base: {
      name: 'master'
    },
    head: {
      name: 'master'
    }
  })).toThrow();
});
