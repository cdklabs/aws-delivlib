import { Construct } from 'constructs';
import * as pr from './pr';
import { WritableGitHubRepo } from '../repo';

/**
 * Properties for configuring the head branch of the bump PR.
 * (The branch the PR will be merged from)
 */
export interface AutoMergeBackHead {

  /**
   * The name of branch. Will be created if it doesn't exist.
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default 'merge-back/$VERSION'
   */
  readonly name?: string;

  /**
   * @see 'source' property in AutoPullRequest.Head
   */
  readonly source?: string;
}

export interface MergeBackStage {

  /**
   * Which stage should the merge back be part of. (Created if missing)
   *
   * @default 'MergeBack'
   */
  readonly name?: string;

  /**
   * The name of the stage that the merge back stage should go after of. (Must exist)
   */
  readonly after: string;
}

export interface AutoMergeBackOptions extends pr.AutoPullRequestOptions {
  /**
   * The command to determine the current version.
   *
   * @default 'git describe'
   */
  versionCommand?: string;

  /**
   * Title of the PR.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default 'chore(release): merge back $VERSION'
   */
  title?: string;

  /**
   * Body of the PR.
   *
   * @default 'See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${head}/CHANGELOG.md)'
   * (Link to the CHANGELOG file of the head branch)
   */
  body?: string;

  /**
   * Head branch of the PR.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default - Will be created from release and named 'merge-back/$VERSION'
   */
  head?: AutoMergeBackHead;

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
   * Description for the CodeBuild project
   *
   * @default - No description
   */
  projectDescription?: string;
}

export interface AutoMergeBackPipelineOptions extends AutoMergeBackOptions {
  /**
   * Specify stage options to create the merge back inside a stage of the pipeline.
   *
   * @default - The CodeBuild project will be created indepdent of any stage.
   */
  readonly stage?: MergeBackStage;
}

export interface AutoMergeBackProps extends AutoMergeBackOptions {
  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;
}

export class AutoMergeBack extends Construct {

  /**
   * The underlying AutoPullRequest construct.
   */
  public readonly pr: pr.AutoPullRequest;

  constructor(parent: Construct, id: string, props: AutoMergeBackProps) {
    super(parent, id);

    const versionCommand = props.versionCommand ?? 'git describe';
    const headName = props.head?.name ?? 'merge-back/$VERSION';
    const title = props.title ?? 'chore(merge-back): $VERSION';
    const body = props.body ?? `See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${headName}/CHANGELOG.md)`;

    this.pr = new pr.AutoPullRequest(this, 'AutoMergeBack', {
      ...props,
      body,
      title,
      head: {
        name: headName,
        source: props.head?.source,
      },
      exports: {
        ...props.exports,
        VERSION: versionCommand,
      },
    });
  }
}
