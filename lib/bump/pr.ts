import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, core as cdk, } from "monocdk-experiment";
import { createBuildEnvironment, BuildEnvironmentProps } from "../build-env";
import permissions = require("../permissions");
import { WritableGitHubRepo } from "../repo";
import { Lazy } from "monocdk-experiment/src/core";

export interface HeadBranch {

  name: string;

  base: string;

}

export interface BaseBranch {

  name: string
}

export interface PullRequest {

  head: HeadBranch;

  base: BaseBranch;

  title?: string;

  body?: string;

  labels?: string[]

}

export interface AutoPullRequestOptions {

  build?: BuildEnvironmentProps

  pr: PullRequest

  /**
   * Git clone depth
   *
   * @default 0 clones the entire repository
   */
  cloneDepth?: number

  exports?: { [key: string]: string }

}

export interface AutoPullRequestProps extends AutoPullRequestOptions {

  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;

}

export class AutoPullRequest extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  public readonly number: string;

  private readonly props: AutoPullRequestProps;

  private body: string = '';
  private labels: string[] = [];

  constructor(parent: cdk.Construct, id: string, props: AutoPullRequestProps) {
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
    this.number = '$PR_NUMBER';

    // by default, clne the entire repo (cloneDepth: 0)
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;

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
              ...this.createHead(),
              ...this.pushHead(),
              this.createPullRequest(),
              Lazy.anyValue({ produce: () => this.updateBody() }),
              Lazy.anyValue({ produce: () => this.applyLabels() })
            ]
          },
        }
      }),
    });

    if (project.role) {
      permissions.grantSecretRead(sshKeySecret, project.role);
      permissions.grantSecretRead({ secretArn: props.repo.tokenSecretArn }, project.role);
    }

    this.alarm = project.metricFailedBuilds({ period: cdk.Duration.seconds(300) }).createAlarm(this, 'BumpFailedAlarm', {
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
  }

  public withBody(bodyBuilder: (pr: AutoPullRequest) => string): AutoPullRequest {
    this.body = bodyBuilder(this);
    return this;
  }

  public withLabels(labelsBuilder: (pr: AutoPullRequest) => string[]): AutoPullRequest {
    this.labels.push(...labelsBuilder(this));
    return this;
  }
  private export(): string[] {

    const ex = this.props.exports ?? {};

    ex.GITHUB_TOKEN = `aws secretsmanager get-secret-value --secret-id "${this.props.repo.tokenSecretArn}" --output=text --query=SecretString`;

    return Object.keys(ex).map((key: string) => `export ${key}=$(${ex[key]})`);
  }

  private createHead(): string[] {

    const head = this.props.pr.head.name;
    const headBase = this.props.pr.head.base ?? 'master';

    return [
      `git checkout ${headBase}`,
      `git checkout -b ${head}`
    ];
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

  private createPullRequest(): string {

    const head = this.props.pr.head.name;
    const base = this.props.pr.base.name ?? 'master';

    if (head === base) {
      throw new Error(`cannot enable pull requests since the head branch ("${base}") is the same as the base branch ("${head}")`);
    }

    const props = this.props;

    const createRequest = {
      title: props.pr.title ?? `Merge ${head} to ${base}`,
      base,
      head
    };

    return `${this.curl('/pulls', '-X POST -o pr.json', createRequest)} && export PR_NUMBER=$(node -p 'require("./pr.json").number')`;

  }

  private updateBody(): string {
    return this.curl(`/pulls/${this.number}`, '-X PATCH', {'body': this.body});
  }

  private applyLabels(): string {
    return this.curl(`/issues/${this.number}/labels`, '-X POST', {'labels': this.labels});
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

