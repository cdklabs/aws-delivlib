import { aws_codebuild as cbuild, aws_codecommit as ccommit,
  aws_codepipeline as cpipeline, aws_codepipeline_actions as cpipeline_actions} from "monocdk-experiment";
  import * as cdk from 'monocdk-experiment';
import { ExternalSecret } from "./permissions";

export interface IRepo {
  repositoryUrlHttp: string;
  repositoryUrlSsh: string;
  readonly allowsBadge: boolean;
  readonly tokenSecretArn?: string;
  createBuildSource(parent: cdk.Construct, webhook: boolean, options?: BuildSourceOptions): cbuild.ISource;
  createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipeline.Artifact;
  describe(): any;
}

export interface BuildSourceOptions {
  branch?: string;
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

  public createBuildSource(_: cdk.Construct, _webhook: boolean, options: BuildSourceOptions = { }): cbuild.ISource {
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
   * The OAuth token secret that allows access to your github repo.
   */
  tokenSecretArn: string;

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

  constructor(props: GitHubRepoProps) {
    const repository = props.repository;
    const [ owner, repo ] = repository.split('/');

    this.owner = owner;
    this.repo = repo;
    this.tokenSecretArn = props.tokenSecretArn;
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
      oauthToken: cdk.SecretValue.secretsManager(this.tokenSecretArn),
      owner: this.owner,
      repo: this.repo,
      output: sourceOutput
    }));
    return sourceOutput;
  }

  public createBuildSource(_: cdk.Construct, webhook: boolean, options: BuildSourceOptions = { }): cbuild.ISource {
    return cbuild.Source.gitHub({
      owner: this.owner,
      repo: this.repo,
      webhook,
      cloneDepth: options.cloneDepth,
      reportBuildStatus: webhook,
      webhookFilters: webhook
          ? this.createWebhookFilters(options.branch)
          : undefined,
    });
  }

  public describe() {
    return `${this.owner}/${this.repo}`;
  }

  private createWebhookFilters(branch?: string) {
    if (branch) {
      return [
        cbuild.FilterGroup.inEventOf(cbuild.EventAction.PUSH)
          .andBranchIs(branch),
        cbuild.FilterGroup.inEventOf(cbuild.EventAction.PULL_REQUEST_CREATED, cbuild.EventAction.PULL_REQUEST_UPDATED)
          .andBaseBranchIs(branch)
      ];
    }
    return [
      cbuild.FilterGroup.inEventOf(
        cbuild.EventAction.PUSH,
        cbuild.EventAction.PULL_REQUEST_CREATED,
        cbuild.EventAction.PULL_REQUEST_UPDATED,
      )
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
