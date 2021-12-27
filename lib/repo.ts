import {
  SecretValue, SecretsManagerSecretOptions,
  aws_codebuild as cbuild, aws_codecommit as ccommit,
  aws_codepipeline as cpipeline, aws_codepipeline_actions as cpipeline_actions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ExternalSecret } from './permissions';

export interface IRepo {
  repositoryUrlHttp: string;
  repositoryUrlSsh: string;
  readonly allowsBadge: boolean;
  readonly tokenSecretArn?: string;
  createBuildSource(parent: Construct, webhook: boolean, options?: BuildSourceOptions): cbuild.ISource;
  createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipeline.Artifact;
  describe(): any;
}

export interface BuildSourceOptions {
  /**
   * Single branch
   *
   * Cannot be specified together with `branches`.
   *
   * @default - All branches
   * @deprecated Use `branches` instead.
   */
  branch?: string;

  /**
   * Multiple branches
   *
   * Cannot be specified together with `branch`.
   *
   * @default - All branches
   */
  branches?: string[];
  cloneDepth?: number;
}

export class CodeCommitRepo implements IRepo {
  public readonly allowsBadge = false;
  public readonly tokenSecretArn?: string;

  constructor(private readonly repository: ccommit.IRepository) {

  }

  public createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipeline.Artifact {
    const stage = pipeline.addStage({
      stageName: 'Source',
    });
    const sourceOutput = new cpipeline.Artifact('Source');
    stage.addAction(new cpipeline_actions.CodeCommitSourceAction({
      actionName: 'Pull',
      repository: this.repository,
      branch,
      output: sourceOutput,
    }));
    return sourceOutput;
  }

  public get repositoryUrlHttp() {
    return this.repository.repositoryCloneUrlHttp;
  }

  public get repositoryUrlSsh() {
    return this.repository.repositoryCloneUrlSsh;
  }

  public createBuildSource(_: Construct, _webhook: boolean, options: BuildSourceOptions = {}): cbuild.ISource {
    return cbuild.Source.codeCommit({
      repository: this.repository,
      cloneDepth: options.cloneDepth,
    });
  }

  public describe(): any {
    return this.repository.repositoryName;
  }
}

interface GitHubRepoProps {
  /**
   * Secrets Manager ARN of the OAuth token secret that allows access to your github repo.
   */
  tokenSecretArn: string;

  /**
   * Options for referencing a secret value from Secrets Manager
   */
  tokenSecretOptions?: SecretsManagerSecretOptions;

  /**
   * In the form "account/repo".
   */
  repository: string;
}

export class GitHubRepo implements IRepo {
  public readonly allowsBadge = true;
  public readonly owner: string;
  public readonly repo: string;
  public readonly tokenSecretArn: string;
  public readonly tokenSecretOptions?: SecretsManagerSecretOptions;

  constructor(props: GitHubRepoProps) {
    const repository = props.repository;
    const [owner, repo] = repository.split('/');

    this.owner = owner;
    this.repo = repo;
    this.tokenSecretArn = props.tokenSecretArn;
    this.tokenSecretOptions = props.tokenSecretOptions;
  }

  public get repositoryUrlHttp() {
    return `https://github.com/${this.owner}/${this.repo}.git`;
  }

  public get repositoryUrlSsh() {
    return `git@github.com:${this.owner}/${this.repo}.git`;
  }

  public createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipeline.Artifact {
    const stage = pipeline.addStage({ stageName: 'Source' });

    const sourceOutput = new cpipeline.Artifact('Source');
    stage.addAction(new cpipeline_actions.GitHubSourceAction({
      actionName: 'Pull',
      branch,
      oauthToken: SecretValue.secretsManager(this.tokenSecretArn, this.tokenSecretOptions),
      owner: this.owner,
      repo: this.repo,
      output: sourceOutput,
    }));
    return sourceOutput;
  }

  public createBuildSource(_: Construct, webhook: boolean, options: BuildSourceOptions = {}): cbuild.ISource {
    if (options.branch && options.branches) {
      throw new Error('Specify at most one of \'branch\' and \'branches\'');
    }
    const branches = options.branches ?? (options.branch ? [options.branch] : []);

    return cbuild.Source.gitHub({
      owner: this.owner,
      repo: this.repo,
      webhook,
      cloneDepth: options.cloneDepth,
      reportBuildStatus: webhook,
      webhookFilters: webhook
        ? this.createWebhookFilters(branches)
        : undefined,
    });
  }

  public describe() {
    return `${this.owner}/${this.repo}`;
  }

  private createWebhookFilters(branches: string[]) {
    if (branches.length > 0) {
      // Turn the list of branches into a regex
      const branchExpr = branches.map(b => `^refs/heads/${b}$`).join('|');

      return [
        cbuild.FilterGroup.inEventOf(cbuild.EventAction.PUSH)
          .andHeadRefIs(branchExpr),
        cbuild.FilterGroup.inEventOf(cbuild.EventAction.PULL_REQUEST_CREATED, cbuild.EventAction.PULL_REQUEST_UPDATED)
          .andBaseRefIs(branchExpr),
      ];
    }
    return [
      cbuild.FilterGroup.inEventOf(
        cbuild.EventAction.PUSH,
        cbuild.EventAction.PULL_REQUEST_CREATED,
        cbuild.EventAction.PULL_REQUEST_UPDATED,
      ),
    ];
  }
}

export interface WritableGitHubRepoProps extends GitHubRepoProps {
  /**
   * SSH key associated with this repository.
   *
   * This is required if you wish to be able to use actions that write to the repo
   * such as docs publishing and automatic bumps.
   */
  sshKeySecret: ExternalSecret;

  /**
   * The username to use for the published commits
   */
  commitUsername: string;

  /**
   * The email address to use for the published commits
   */
  commitEmail: string;

}

export class WritableGitHubRepo extends GitHubRepo {

  public static isWritableGitHubRepo(repo: IRepo): repo is WritableGitHubRepo {
    const obj = repo as any;

    return 'sshKeySecret' in obj
      && 'commitEmail' in obj
      && 'commitUsername' in obj;
  }

  public readonly sshKeySecret: ExternalSecret;
  public readonly commitEmail: string;
  public readonly commitUsername: string;

  constructor(props: WritableGitHubRepoProps) {
    super(props);

    this.sshKeySecret = props.sshKeySecret;
    this.commitEmail = props.commitEmail;
    this.commitUsername = props.commitUsername;
  }
}
