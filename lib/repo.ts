import cbuild = require('@aws-cdk/aws-codebuild');
import ccommit = require('@aws-cdk/aws-codecommit');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import cdk = require('@aws-cdk/cdk');
import { ExternalSecret } from './permissions';

export interface IRepo {
  repositoryUrlHttp: string;
  repositoryUrlSsh: string;
  createBuildSource(parent: cdk.Construct): cbuild.BuildSource;
  createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipelineapi.SourceAction;
  describe(): any;
}

export class CodeCommitRepo implements IRepo {
  constructor(private readonly repository: ccommit.RepositoryRef) {

  }

  public createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipelineapi.SourceAction {
    const stage = new cpipeline.Stage(pipeline, 'Source', { pipeline });
    return new ccommit.PipelineSourceAction(stage, 'Pull', {
      stage,
      repository: this.repository,
      branch,
      outputArtifactName: 'Source'
    });
  }

  public get repositoryUrlHttp() {
    return this.repository.repositoryCloneUrlHttp;
  }

  public get repositoryUrlSsh() {
    return this.repository.repositoryCloneUrlSsh;
  }

  public createBuildSource(_: cdk.Construct) {
    return new cbuild.CodeCommitSource({
      repository: this.repository
    });
  }

  public describe(): any {
    return this.repository.repositoryName;
  }
}

interface GitHubRepoProps {
  /**
   * SSM parameter name that contains an OAuth token that allows access to
   * your github repo.
   */
  tokenParameterName: string;

  /**
   * In the form "account/repo".
   */
  repository: string;
}

export class GitHubRepo implements IRepo {
  public readonly owner: string;
  public readonly repo: string;
  public readonly tokenParameterName: string;

  constructor(props: GitHubRepoProps) {
    const repository = props.repository;
    const [ owner, repo ] = repository.split('/');

    this.owner = owner;
    this.repo = repo;

    this.tokenParameterName = props.tokenParameterName;
  }

  public get repositoryUrlHttp() {
    return `https://github.com/${this.owner}/${this.repo}.git`;
  }

  public get repositoryUrlSsh() {
    return `git@github.com:${this.owner}/${this.repo}.git`;
  }

  public createSourceStage(pipeline: cpipeline.Pipeline, branch: string): cpipelineapi.SourceAction {
    const oauth = new cdk.SecretParameter(pipeline, 'GitHubToken', { ssmParameter: this.tokenParameterName });

    const stage = new cpipeline.Stage(pipeline, 'Source', { pipeline });

    return new cpipeline.GitHubSourceAction(stage, 'Pull', {
      branch,
      oauthToken: oauth.value,
      outputArtifactName: 'Source',
      owner: this.owner,
      repo: this.repo,
      stage
    });
  }

  public createBuildSource(parent: cdk.Construct) {
    const oauth = new cdk.SecretParameter(parent, 'GitHubToken', { ssmParameter: this.tokenParameterName });

    return new cbuild.GitHubSource({
      cloneUrl: this.repositoryUrlHttp,
      oauthToken: oauth.value,
    });
  }

  public describe() {
    return `${this.owner}/${this.repo}`;
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
