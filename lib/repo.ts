import ccommit = require('@aws-cdk/aws-codecommit');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import cdk = require('@aws-cdk/cdk');

export interface IRepo {
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

  public describe() {
    return `${this.owner}/${this.repo}`;
  }
}
