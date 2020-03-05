import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, aws_events as events, aws_events_targets as events_targets, core as cdk, } from "monocdk-experiment";
import { createBuildEnvironment } from "../build-env";
import permissions = require("../permissions");
import { WritableGitHubRepo } from "../repo";

export interface AutoBumpOptions {
  /**
   * The command to execute in order to bump the repo.
   *
   * The bump command is responsible to bump any version metadata, update
   * CHANGELOG and commit this to the repository.
   *
   * @default "/bin/bash ./bump.sh"
   */
  bumpCommand?: string;

  /**
   * The command to determine the current version.
   * @default "git describe" by default the latest git tag will be used to determine the current version
   */
  versionCommand?: string;

  /**
   * The schedule to produce an automatic bump.
   *
   * The expression can be one of:
   *
   *  - cron expression, such as "cron(0 12 * * ? *)" will trigger every day at 12pm UTC
   *  - rate expression, such as "rate(1 day)" will trigger every 24 hours from the time of deployment
   *
   * To disable, use the string `disable`.
   *
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html
   * @default "cron(0 12 * * ? *)" (12pm UTC daily)
   */
  scheduleExpression?: string;

  /**
   * The image used for the builds.
   *
   * @default jsii/superchain (see docs)
   */
  buildImage?: cbuild.IBuildImage;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default taken from {@link #buildImage#defaultComputeType}
   */
  computeType?: cbuild.ComputeType;

  /**
   * Indicates how the project builds Docker images. Specify true to enable
   * running the Docker daemon inside a Docker container. This value must be
   * set to true only if this build project will be used to build Docker
   * images, and the specified build environment image is not one provided by
   * AWS CodeBuild with Docker support. Otherwise, all associated builds that
   * attempt to interact with the Docker daemon will fail.
   *
   * @default false
   */
  privileged?: boolean;

  /**
   * Environment variables to pass to build
   */
  env?: { [key: string]: string };

  /**
   * The name of the branch to push the bump commit (e.g. "master")
   * This branch has to exist.
   *
   * @default - the commit will be pushed to the branch `bump/$VERSION`
   */
  branch?: string;

  /**
   * Create a pull request after the branch is pushed.
   * However, if there are no code changes after the bump is complete,
   * no pull request will be created.
   *
   * @default - true if `pullRequestOptions` is specified, `false` otherwise.
   */
  pullRequest?: boolean;

  /**
   * Options for pull request
   *
   * @default - default options
   */
  pullRequestOptions?: PullRequestOptions;

  /**
   * Git clone depth
   *
   * @default 0 clones the entire repository
   */
  cloneDepth?: number;
}

export interface AutoBumpProps extends AutoBumpOptions {
  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;
}

export interface PullRequestOptions {
  /**
   * The title of the pull request.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default "chore(release): $VERSION"
   */
  title?: string;

  /**
   * The PR body.
   * @default "see CHANGELOG"
   */
  body?: string;

  /**
   * Base branch
   * @default "master"
   */
  base?: string;
}

export class AutoBump extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: cdk.Construct, id: string, props: AutoBumpProps) {
    super(parent, id);

    const bumpCommand = props.bumpCommand || '/bin/sh ./bump.sh';
    const sshKeySecret = props.repo.sshKeySecret;

    if (!sshKeySecret) {
      throw new Error(`Cannot install auto-bump on a repo without an SSH key secret`);
    }

    const commitEmail = props.repo.commitEmail;
    if (!commitEmail) {
      throw new Error(`Cannot install auto-bump on a repo without "commitEmail"`);
    }

    const commitUsername = props.repo.commitUsername;
    if (!commitUsername) {
      throw new Error(`Cannot install auto-bump on a repo without "commitUsername"`);
    }

    const pushCommands = new Array<string>();

    const versionCommand = props.versionCommand ?? "git describe";

    pushCommands.push(...[
      `export VERSION=$(${versionCommand})`,
      `export BRANCH=bump/$VERSION`,
      `git branch -D $BRANCH || true`,                    // force delete the branch if it already exists
      `git checkout -b $BRANCH`,                          // create a new branch from HEAD
    ]);

    // if we want to merge this to a branch automatically, then check out the branch and merge
    if (props.branch) {
      pushCommands.push(...[
        `git checkout ${props.branch}`,
        `git merge $BRANCH`
      ]);
    }

    // add "origin" remote
    pushCommands.push(`git remote add origin_ssh ${props.repo.repositoryUrlSsh}`);

    // now push either to our bump branch or the destination branch
    const targetBranch = props.branch || '$BRANCH';
    pushCommands.push(`git push --follow-tags origin_ssh ${targetBranch}`);

    const pullRequestEnabled = props.pullRequest || props.pullRequestOptions;
    if (pullRequestEnabled) {

      // we can't create a pull request if base=head
      if (props.branch) {
        const base = props.pullRequestOptions?.base ?? 'master';
        if (props.branch === base) {
          throw new Error(`cannot enable pull requests since the head branch ("${props.branch}") is the same as the base branch ("${base}")`);
        }
      }

      pushCommands.push(...createPullRequestCommands(props.repo, props.pullRequestOptions));
    }

    // by default, clone the entire repo (cloneDepth: 0)
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;

    const project = new cbuild.Project(this, 'Bump', {
      source: props.repo.createBuildSource(this, false, { cloneDepth }),
      environment: createBuildEnvironment(props),
      buildSpec: cbuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              `git config --global user.email "${commitEmail}"`,
              `git config --global user.name "${commitUsername}"`,
            ]
          },
          build: {
            commands: [
              // We would like to do the equivalent of "if (!changes) { return success; }" here, but we can't because
              // there's no way to stop a BuildSpec execution halfway through without throwing an error. Believe me, I
              // checked the code. Instead we define a variable that we will switch all other lines on.
              // tslint:disable-next-line:max-line-length
              `git describe --exact-match HEAD && { echo "No new commits."; export SKIP=true; } || { echo "Changes to release."; export SKIP=false; }`,
              `$SKIP || { ${bumpCommand}; }`,
              `$SKIP || aws secretsmanager get-secret-value --secret-id "${sshKeySecret.secretArn}" --output=text --query=SecretString > ~/.ssh/id_rsa`,
              `$SKIP || mkdir -p ~/.ssh`,
              `$SKIP || chmod 0600 ~/.ssh/id_rsa`,
              `$SKIP || chmod 0600 ~/.ssh/config`,
              `$SKIP || ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts`,
              ...pushCommands.map(c => `$SKIP || { ${c} ; }`)
            ]
          },
        }
      }),
    });

    if (project.role) {
      permissions.grantSecretRead(sshKeySecret, project.role);

      // if pull request is enabled, we also need access to the github token
      if (pullRequestEnabled) {
        permissions.grantSecretRead({ secretArn: props.repo.tokenSecretArn }, project.role);
      }
    }

    if (props.scheduleExpression !== 'disable') {
      // set up the schedule
      const schedule = events.Schedule.expression(props.scheduleExpression === undefined
          ? 'cron(0 12 * * ? *)'
          : props.scheduleExpression);
      new events.Rule(this, 'Scheduler', {
        description: 'Schedules an automatic bump for this repository',
        schedule,
        targets: [new events_targets.CodeBuildProject(project)],
      });
    }

    this.alarm = project.metricFailedBuilds({ period: cdk.Duration.seconds(300) }).createAlarm(this, 'BumpFailedAlarm', {
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
  }
}

function createPullRequestCommands(repo: WritableGitHubRepo, options: PullRequestOptions = { }): string[] {
  const request = {
    title: options.title ?? `chore(release): $VERSION`,
    body: options.body ?? `see CHANGELOG`,
    base: options.base ?? `master`,
    head: `$BRANCH`
  };

  const condition = `git diff --exit-code --no-patch ${request.head} ${request.base} && ` +
    '{ echo "No changes after bump. Skipping pull request..."; export SKIP=true; } || ' +
    '{ echo "Creating pull request..."; export SKIP=false; }';

  const curl = [
    `curl`,
    `-X POST`,
    `--header "Authorization: token $GITHUB_TOKEN"`,
    `--header "Content-Type: application/json"`,
    `-d ${JSON.stringify(JSON.stringify(request))}`, // to escape quotes
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls`
  ];

  return [
    condition,
    `GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id "${repo.tokenSecretArn}" --output=text --query=SecretString)`,
    curl.join(' ')
  ];
}
