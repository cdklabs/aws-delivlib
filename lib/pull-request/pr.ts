import { aws_cloudwatch as cloudwatch,
  aws_codebuild as cbuild,
  aws_events as events,
  aws_events_targets as events_targets } from "monocdk-experiment";
import * as cdk from 'monocdk-experiment';
import { BuildEnvironmentProps, createBuildEnvironment } from "../build-env";
import { WritableGitHubRepo } from "../repo";
import permissions = require("../permissions");

/**
 * Properties for creating a Pull Request Job.
 */
export interface AutoPullRequestProps {

  /**
   * The repository to create a PR in.
   */
  repo: WritableGitHubRepo;

  /**
   * The head branch of the PR.
   */
  head: Head;

  /**
   * The base branch of the PR.
   *
   * @default 'master'
   */
  base?: Base;

  /**
   * True if you only want to push the head branch without creating a PR.
   * Useful when used along with 'commits' to execute a commit-and-push automatically.
   *
   * // TODO: Consider moving this functionality to a separate construct.
   *
   * @default false
   */
  readonly pushOnly?: boolean;

  /**
   * Title of the PR.
   *
   * @default `Merge ${head} to ${base}`
   */
  title?: string;

  /**
   * Body the PR. Note that the body is updated post PR creation,
   * this means you can use the $PR_NUMBER env variable to refer to the PR itself.
   *
   * @default - no body.
   */
  body?: string;

  /**
   * Labels applied to the PR.
   *
   * @default - no labels.
   */
  labels?: string[];

  /**
   * Build environment for the CodeBuild job.
   *
   * @default - default configuration.
   */
  build?: BuildEnvironmentProps;

  /**
   * A set of commands to run against the head branch.
   * Useful for things like version bumps or any auto-generated commits.
   *
   * Note that you cannot use export keys in these commands (See `exports` property)
   *
   * @default - no commands.
   */
  commands?: string[];

  /**
   * The exit code of this command determines whether or not to proceed with the
   * PR creation. If configured, this command is the first one to run, and if it fails, all
   * other commands will be skipped.
   *
   * This command is the first to execute, and should not assume any pre-existing state.
   *
   * @default - no condition
   */
  condition?: string;

  /**
   * Git clone depth.
   *
   * @default 0 (clones the entire repository revisions)
   */
  cloneDepth?: number;

  /**
   * Key value pairs of variables to export. These variables will be available for dynamic evaluation in any
   * subsequent command.
   *
   * Key - Variable name (e.g VERSION)
   * Value - Command that evaluates to the value of the variable (e.g 'git describe')
   *
   * Example:
   *
   * Configure an export in the form of:
   *
   * { 'VERSION': 'git describe' }
   *
   * Use the $VERSION variable in the PR title: 'chore(release): $VERSION'
   *
   * Note that these exports are executed after the `commands` execution,
   * so they have access to the artifacts said commands produce (e.g version bump).
   *
   * @default - no exports
   */
  exports?: { [key: string]: string };

  /**
   * The schedule to produce an automatic PR.
   *
   * The expression can be one of:
   *
   *  - cron expression, such as "cron(0 12 * * ? *)" will trigger every day at 12pm UTC
   *  - rate expression, such as "rate(1 day)" will trigger every 24 hours from the time of deployment
   *
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html
   *
   * @default - no schedule, should be triggered manually.
   */
  scheduleExpression?: string;

}

/**
 * Properties for configuring the base branch of the PR.
 */
export interface Base {

  /**
   * Branch name.
   *
   * This branch must exist.
   *
   * @default 'master'
   */
  readonly name?: string
}

/**
 * Properties for configuring the head branch of the PR.
 */
export interface Head {

  /**
   * Branch name.
   *
   * This branch will be created if it doesn't exist.
   */
  readonly name: string

  /**
   * The base sha of the branch.
   *
   * If the given branch already exists, this sha will be auto-merged onto it. Note that in such a case,
   * the PR creation might fail in case there are merge conflicts.
   *
   * If the given branch doesn't exist, the newly created branch will be based of this hash.
   *
   * @default - the base branch of the pr.
   */
  readonly sha?: string
}

/**
 * Creates a CodeBuild job that, when triggered, opens a GitHub Pull Request.
 */
export class AutoPullRequest extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if the job fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  /**
   * The CodeBuild project this construct creates.
   */
  public readonly project: cbuild.IProject;

  private readonly props: AutoPullRequestProps;

  private readonly baseBranch: string;
  private readonly headHash: string;

  constructor(parent: cdk.Construct, id: string, props: AutoPullRequestProps) {
    super(parent, id);

    this.props = props;

    this.baseBranch = props.base?.name ?? 'master';
    this.headHash = props.head.sha ?? this.baseBranch;

    const sshKeySecret = props.repo.sshKeySecret;
    const commitEmail = props.repo.commitEmail;
    const commitUsername = props.repo.commitUsername;
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;

    let commands: string[] = [];

    if (this.props.condition) {
      // there's no way to stop a BuildSpec execution halfway through without throwing an error. Believe me, I
      // checked the code. Instead we define a variable that we will switch all other lines on/off.
      commands.push(`${this.props.condition} ` +
      `&& { echo 'Skip condition is met, skipping...' && export SKIP=true; } ` +
      `|| { echo 'Skip condition is not met, continuing...' && export SKIP=false; }`);
    }

    commands.push(
      ...this.createHead(),
      ...this.pushHead(),
    );

    if (!this.props.pushOnly) {
      commands.push(...this.createPullRequest());
    }

    // toggle all commands according to the SKIP variable.
    commands = commands.map((command: string) => `$SKIP || { ${command} ; }`);

    // intially all commands are enabled.
    commands.unshift('export SKIP=false',);

    this.project = new cbuild.Project(this, 'PullRequest', {
      source: props.repo.createBuildSource(this, false, { cloneDepth }),
      environment: createBuildEnvironment(props.build ?? {}),
      buildSpec: cbuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              `git config --global user.email "${commitEmail}"`,
              `git config --global user.name "${commitUsername}"`,
            ]
          },
          build: { commands },
        }
      }),
    });

    if (this.project.role) {
      permissions.grantSecretRead(sshKeySecret, this.project.role);

      if (!this.props.pushOnly) {
        permissions.grantSecretRead({ secretArn: props.repo.tokenSecretArn }, this.project.role);
      }
    }

    if (props.scheduleExpression) {
      const schedule = events.Schedule.expression(props.scheduleExpression);
      new events.Rule(this, 'Scheduler', {
        description: 'Schedules an automatic Pull Request for this repository',
        schedule,
        targets: [new events_targets.CodeBuildProject(this.project)],
      });
    }

    this.alarm = this.project.metricFailedBuilds({ period: cdk.Duration.seconds(300) }).createAlarm(this, 'AutoPullRequestFailedAlarm', {
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
  }

  private createHead(): string[] {

    return [
      // check if head branch exists
      `git rev-parse --verify ${this.props.head.name} ` +

      // checkout and merge if it does (this might fail due to merge conflicts)
      `&& { git checkout ${this.props.head.name} && git merge ${this.headHash} && ${this.runCommands()};  } ` +

      // create if it doesnt
      `|| { git checkout ${this.headHash} && git checkout -b temp && ${this.runCommands()} && git branch -m ${this.props.head.name}; }`,

    ];

  }

  private runCommands(): string {

    const userCommands = this.props.commands ?? [];
    const exports = Object.entries(this.props.exports ?? {}).map(entry => `export ${entry[0]}=$(${entry[1]})`);

    return [

      ...userCommands,

      // exports should be executed immediately after the user commands (not before)
      // because they might need access to artifacts produced by them.
      ...exports,

      'echo Finished running user commands'
    ].join('&&');

  }

  private pushHead(): string[] {

    return [
      `git remote add origin_ssh ${this.props.repo.repositoryUrlSsh}`,
      `aws secretsmanager get-secret-value `
        + `--secret-id "${this.props.repo.sshKeySecret.secretArn}" `
        + `--output=text --query=SecretString > ~/.ssh/id_rsa`,
      `mkdir -p ~/.ssh`,
      `chmod 0600 ~/.ssh/id_rsa`,
      `chmod 0600 ~/.ssh/config`,
      `ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts`,
      `git push --follow-tags origin_ssh ${this.props.head.name}`
    ];
  }

  private createPullRequest(): string[] {

    const head = this.props.head.name;
    const base = this.baseBranch;

    if (head === base) {
      throw new Error(`Head branch ("${base}") is the same as the base branch ("${head}")`);
    }

    const props = this.props;
    const title = props.title ?? `Merge ${head} to ${base}`;
    const body = this.props.body ?? '';

    const createRequest = { title, base, head };

    const commands = [];

    // don't create if head.hash == base.hash
    commands.push(`git diff --exit-code --no-patch ${head} ${base} && ` +
    '{ echo "Skipping pull request..."; export SKIP=true; } || ' +
    '{ echo "Creating pull request..."; export SKIP=false; }');

    // read the token
    commands.push(`export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id "${this.props.repo.tokenSecretArn}" --output=text --query=SecretString)`);

    // create the PR
    commands.push(`${this.githubCurl('/pulls', '-X POST -o pr.json', createRequest)} && export PR_NUMBER=$(node -p 'require("./pr.json").number')`);

    // update the body
    commands.push(this.githubCurl(`/pulls/$PR_NUMBER`, '-X PATCH', {'body': body}));

    // apply labels
    commands.push(this.githubCurl(`/issues/$PR_NUMBER/labels`, '-X POST', {'labels': this.props.labels ?? []}));

    return commands;

  }

  private githubCurl(uri: string, command: string, request: any): string {
    return [
      `curl --fail`,
      command,
      `--header "Authorization: token $GITHUB_TOKEN"`,
      `--header "Content-Type: application/json"`,
        `-d ${JSON.stringify(JSON.stringify(request))}`,
      `https://api.github.com/repos/${this.props.repo.owner}/${this.props.repo.repo}${uri}`
    ].join(' ');
  }

}

