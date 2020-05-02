import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, aws_events as events, aws_events_targets as events_targets, core as cdk, } from "monocdk-experiment";
import { createBuildEnvironment, BuildEnvironmentProps } from "../build-env";
import permissions = require("../permissions");
import { WritableGitHubRepo } from "../repo";

export interface NewBranch {
  readonly name: string
  readonly hash: string
}

export class Branch {

  private constructor(
    public readonly name: string,
    public readonly existing: boolean,
    public readonly hash?: string ) {}

  public static new(branch: NewBranch): Branch {
    return new Branch(branch.name, false, branch.hash);
  }

  public static existing(name: string): Branch {
    return new Branch(name, true, undefined);
  }

}

export interface PullRequest {

  title?: string;

  body?: string

  labels?: string[]

  allowEmpty?: boolean

}

export interface AutoCodeReviewOptions {

  build?: BuildEnvironmentProps

  source: Branch;

  target: Branch;

  commit?: string[]

  pr?: PullRequest

  skipCommand?: string

  /**
   * Git clone depth
   *
   * @default 0 clones the entire repository
   */
  cloneDepth?: number

  exports?: { [key: string]: string }

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

}

export interface AutoCodeReviewProps extends AutoCodeReviewOptions {

  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;

}

export class AutoCodeReview extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  private readonly props: AutoCodeReviewProps;

  private body: string;
  private labels: string[];
  private skipCommand: string | undefined;

  constructor(parent: cdk.Construct, id: string, props: AutoCodeReviewProps) {
    super(parent, id);

    const sshKeySecret = props.repo.sshKeySecret;
    if (!sshKeySecret) {
      throw new Error(`Cannot install pull request on a repo without an SSH key secret`);
    }

    const commitEmail = props.repo.commitEmail;
    if (!commitEmail) {
      throw new Error(`Cannot install pull request on a repo without "commitEmail"`);
    }

    const commitUsername = props.repo.commitUsername;
    if (!commitUsername) {
      throw new Error(`Cannot install pull request on a repo without "commitUsername"`);
    }

    const token = props.repo.tokenSecretArn;
    if (!token) {
      throw new Error(`Cannot install pull request on a repo without "tokenSecretArn"`);
    }

    this.props = props;

    this.body = this.props.pr?.body ?? '';
    this.labels = this.props.pr?.labels ?? [];
    this.skipCommand = this.props.skipCommand;

    // by default, clne the entire repo (cloneDepth: 0)
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;

    let commands: string[] = [];

    if (this.skipCommand) {
      commands.push(this.skipIf());
    }

    commands.push(
      ...this.createHead(),
      ...this.pushHead()
    );

    // support for only creating a branch, without the actual PR.
    // doesn't feel natural - think of a better way.
    if (this.props.pr) {
      commands.push(
        ...this.createPullRequest(),
        ...this.updateBody(),
        ...this.applyLabels());
    }

    commands = commands.map(this.skipOr);

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
      permissions.grantSecretRead({ secretArn: props.repo.tokenSecretArn }, project.role);
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

  private skipOr(command: string) {
    return `$SKIP || { ${command} ; }`;
  }

  private export(): string[] {

    const ex = this.props.exports ?? {};

    ex.GITHUB_TOKEN = `aws secretsmanager get-secret-value --secret-id "${this.props.repo.tokenSecretArn}" --output=text --query=SecretString`;
    ex.SKIP = 'echo false';

    return Object.keys(ex).map((key: string) => `export ${key}=$(${ex[key]})`);
  }

  private createHead(): string[] {

    const head = this.props.source;
    const hash = this.props.source.hash ?? 'master';
    const base = this.props.target.name;

    const commands = [];

    if (head.existing) {
      // if the head branch exists we automatically merge
      // the base onto it. note that this can fail with conflicts.
      commands.push(
        `git checkout ${head}`,
        `git merge ${base}`,
      );
    } else {
      // if the head branch doesn't exist, we create it from
      // the specified hash
      commands.push(
        `git checkout ${hash}`,
        `git checkout -b ${head}`,
      );
    }

    // now we perform the commits
    commands.push(...(this.props.commit ?? []));

    return commands;
  }

  private pushHead(): string[] {

    const head = this.props.source.name;

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

    const head = this.props.source.name;
    const base = this.props.target.name;

    if (head === base) {
      throw new Error(`cannot enable pull requests since the head branch ("${base}") is the same as the base branch ("${head}")`);
    }

    const props = this.props;
    const allowEmpty = props.pr!.allowEmpty ?? true;

    const createRequest = {
      title: props.pr!.title ?? `Merge ${head} to ${base}`,
      base,
      head
    };

    const commands = [];

    if (!allowEmpty) {
      // don't create if head.hash == base.hash
      commands.push(`git diff --exit-code --no-patch ${head} ${base} && ` +
      '{ echo "Skipping pull request..."; export SKIP=true; } || ' +
      '{ echo "Creating pull request..."; export SKIP=false; }');
    }

    commands.push(`${this.curl('/pulls', '-X POST -o pr.json', createRequest)} && export PR_NUMBER=$(node -p 'require("./pr.json").number')`);
    return commands;

  }

  private skipIf() {
    return `${this.skipCommand} && { export SKIP=true; } || { export SKIP=false; }`;
  }

  private updateBody(): string[] {
    return [this.curl(`/pulls/$PR_NUMBER`, '-X PATCH', {'body': this.body})];
  }

  private applyLabels(): string[] {
    return [this.curl(`/issues/$PR_NUMBER/labels`, '-X POST', {'labels': this.labels})];
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

