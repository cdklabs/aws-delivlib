import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, aws_events as events, aws_events_targets as events_targets, core as cdk } from "monocdk-experiment";
import { BuildEnvironmentProps, createBuildEnvironment } from "../build-env";
import { WritableGitHubRepo } from "../repo";
import permissions = require("../permissions");

/**
 * Properties for defining a non-existing branch.
 */
export interface NewBranch {

  /**
   * The desired name of the branch.
   */
  readonly name: string

  /**
   * The base hash of the branch.
   * (used in 'git checkout {hash}' prior to creating the new branch)
   */
  readonly hash: string
}

/**
 * Represents a branch in the repo.
 */
export class Branch {

  private constructor(
    public readonly name: string,
    public readonly exists: boolean,
    public readonly hash?: string ) {}

  /**
   * Configure a new branch to be created.
   *
   * @param branch the new branch properties.
   */
  public static create(branch: NewBranch): Branch {
    return new Branch(branch.name, false, branch.hash);
  }

  /**
   * Configure an existing branch.
   *
   * @param name the name of the existing branch.
   */
  public static use(name: string): Branch {
    return new Branch(name, true, undefined);
  }

}

/**
 * Properties for defining a Pull Request.
 */
export interface PullRequest {

  /**
   * The head branch of the PR.
   */
  head: Branch;

  /**
   * The base branch of the PR.
   */
  base: Branch;

  /**
   * Title of the PR.
   *
   * @default `Merge ${head} to ${base}`
   */
  title?: string;

  /**
   * Body the PR. Note that the body is updated post PR creation,
   * this means you can use the $PR_NUMBER variable to refer to the PR itself.
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

}

export interface AutoPullRequestOptions {

  /**
   * Spec for the PR.
   */
  pr: PullRequest;

  /**
   * Build environment for the CodeBuild job.
   *
   * @default - default configuration.
   */
  build?: BuildEnvironmentProps;

  /**
   * A set of commands to commit new code onto the head branch.
   * Useful for things like version bumps or any auto-generated commits.
   *
   * @default - no commands.
   */
  commits?: string[];

  /**
   * Only push the head branch to the repo, without opening the PR.
   */
  pushOnly?: boolean;

  /**
   * The exit code of this command determines whether or not to proceed with the
   * PR creation. If configured, this command is the first one to run, and if it fails, all
   * other commands will be skipped.
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

export interface AutoPullRequestProps extends AutoPullRequestOptions {

  /**
   * The repository to create a PR in.
   */
  repo: WritableGitHubRepo;

}

/**
 * Creates a CodeBuild job that, when triggered, opens a GitHub Pull Request.
 */
export class AutoPullRequest extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  private readonly props: AutoPullRequestProps;

  private body: string;
  private labels: string[];
  private condition: string;

  constructor(parent: cdk.Construct, id: string, props: AutoPullRequestProps) {
    super(parent, id);

    this.props = props;

    const sshKeySecret = props.repo.sshKeySecret;
    const commitEmail = props.repo.commitEmail;
    const commitUsername = props.repo.commitUsername;
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;
    const pushOnly = this.props.pushOnly ?? false;

    this.body = this.props.pr?.body ?? '';
    this.labels = this.props.pr?.labels ?? [];
    this.condition = this.props.condition ?? '';

    let commands: string[] = [];

    if (this.condition) {
      // there's no way to stop a BuildSpec execution halfway through without throwing an error. Believe me, I
      // checked the code. Instead we define a variable that we will switch all other lines on.
      commands.push(`${this.condition} && { export SKIP=true; } || { export SKIP=false; }`);
    }

    commands.push(
      ...this.createHead(),
      ...this.pushHead()
    );

    // support for only creating a branch, without the actual PR.
    // (TBD - do we really need this?)
    if (!pushOnly) {
      commands.push(...this.createPullRequest());
    }

    // toggle all commands according to the SKIP variable.
    commands = commands.map((command: string) => `$SKIP || { ${command} ; }`);

    const project = new cbuild.Project(this, 'PullRequest', {
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
          build: {
            commands: [
              ...this.export(),
              ...commands
            ]
          },
        }
      }),
    });

    if (project.role) {
      permissions.grantSecretRead(sshKeySecret, project.role);

      if (!pushOnly) {
        // we will be using the token to create a PR.
        permissions.grantSecretRead({ secretArn: props.repo.tokenSecretArn }, project.role);
      }

    }

    if (props.scheduleExpression) {
      const schedule = events.Schedule.expression(props.scheduleExpression);
      new events.Rule(this, 'Scheduler', {
        description: 'Schedules an automatic Pull Request for this repository',
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

  private export(): string[] {

    const ex = this.props.exports ?? {};
    ex.SKIP = 'echo false';

    return Object.keys(ex).map((key: string) => `export ${key}=$(${ex[key]})`);
  }

  private createHead(): string[] {

    const head = this.props.pr.head;
    const hash = this.props.pr.head.hash ?? 'master';
    const base = this.props.pr.base.name;

    const commands = [];

    if (head.exists) {
      // if the head branch exists we automatically merge
      // the base onto it. note that this can fail with conflicts.
      commands.push(
        `git checkout ${head.name}`,
        `git merge ${base}`,
      );
    } else {
      // if the head branch doesn't exist, we create it from
      // the specified hash
      commands.push(
        `git checkout ${hash}`,
        `git checkout -b ${head.name}`,
      );
    }

    // now we perform the commits
    commands.push(...(this.props.commits ?? []));

    return commands;
  }

  private pushHead(): string[] {

    const head = this.props.pr.head.name;

    const sshKeyArn = this.props.repo.sshKeySecret.secretArn;
    return [
      `git remote add origin_ssh ${this.props.repo.repositoryUrlSsh}`,
      `aws secretsmanager get-secret-value --secret-id "${sshKeyArn}" --output=text --query=SecretString > ~/.ssh/id_rsa`,
      `mkdir -p ~/.ssh`,
      `chmod 0600 ~/.ssh/id_rsa`,
      `chmod 0600 ~/.ssh/config`,
      `ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts`,
      `git push --follow-tags origin_ssh ${head}`
    ];
  }

  private createPullRequest(): string[] {

    const head = this.props.pr.head.name;
    const base = this.props.pr.base.name;

    if (head === base) {
      throw new Error(`Head branch ("${base}") is the same as the base branch ("${head}")`);
    }

    const props = this.props;

    const createRequest = {
      title: props.pr.title ?? `Merge ${head} to ${base}`,
      base,
      head
    };

    const commands = [];

    // don't create if head.hash == base.hash
    commands.push(`git diff --exit-code --no-patch ${head} ${base} && ` +
    '{ echo "Skipping pull request..."; export SKIP=true; } || ' +
    '{ echo "Creating pull request..."; export SKIP=false; }');

    // read the token
    commands.push(`export GITHUB_TOKEN=$(aws secretsmanager get-secret-value --secret-id "${this.props.repo.tokenSecretArn}" --output=text --query=SecretString)`);

    // create the PR
    commands.push(`${this.curl('/pulls', '-X POST -o pr.json', createRequest)} && export PR_NUMBER=$(node -p 'require("./pr.json").number')`);

    // update the body
    commands.push(this.curl(`/pulls/$PR_NUMBER`, '-X PATCH', {'body': this.body}));

    // apply labels
    commands.push(this.curl(`/issues/$PR_NUMBER/labels`, '-X POST', {'labels': this.labels}));

    return commands;

  }

  private curl(uri: string, command: string, request: any): string {
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

