import * as cdk from "monocdk-experiment";
import { WritableGitHubRepo } from "../repo";
import * as pr from './pr';
import { AutoPullRequestProps } from "./pr";

/**
 *
 * We want to expose most of the AutoPullRequestOptions, but not all:
 *
 *  - commands: We don't allow any commands on the head branch. The point is to merge back existing commits.
 *  - head: We want to provide a default value for the head branch name.
 */
type Omitted = Omit<AutoPullRequestProps, 'commands' | 'head'>;

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
  readonly name?: string

  /**
   * @see 'source' property in AutoPullRequest.Head
   */
  readonly source?: string
}

export interface AutoMergeBackProps extends Omitted {

  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;

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
  head?: AutoMergeBackHead

}

export class AutoMergeBack extends cdk.Construct {

  /**
   * The underlying AutoPullRequest construct.
   */
  public readonly pr: pr.AutoPullRequest;

  constructor(parent: cdk.Construct, id: string, props: AutoMergeBackProps) {
    super(parent, id);

    const versionCommand = props.versionCommand ?? 'git describe';
    const headName = props.head?.name ?? 'merge-back/$VERSION';
    const title = props.title ?? `chore(merge-back): $VERSION`;
    const body = props.body ?? `See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${headName}/CHANGELOG.md)`;

    this.pr = new pr.AutoPullRequest(this, 'AutoMergeBack', {
      ...props,
      body,
      title,
      head: {
        name: headName,
        source: props.head?.source
      },
      exports: {
        ...props.exports,
        'VERSION': versionCommand,
      }
    });
  }
}