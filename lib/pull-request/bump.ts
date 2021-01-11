import * as cdk from 'monocdk';
import { AutoPullRequest, AutoPullRequestOptions } from './pr';

/**
 * Properties for configuring the head branch of the bump PR.
 */
export interface AutoBumpHead {

  /**
   * The name of branch. Will be created if it doesn't exist.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default 'bump/$VERSION'
   */
  readonly name?: string

  /**
   * @see 'source' property in AutoPullRequest.Head
   */
  readonly source?: string
}

/**
 * Options for configuring an Auto Bump project.
 */
export interface AutoBumpProps extends AutoPullRequestOptions {

  /**
   * The command to execute in order to bump the repo.
   *
   * The bump command is responsible to bump any version metadata, update
   * CHANGELOG and commit this to the repository.
   *
   * @default '/bin/bash ./bump.sh'
   */
  bumpCommand?: string;

  /**
   * The command to determine the current version.
   *
   * This is the value that will be used to evaluate $VERSION.
   *
   * @default 'git describe' (the latest git tag will be used to determine the current version)
   */
  versionCommand?: string;

  /**
   * Title of the PR.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default' chore(release): $VERSION'
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
   * The head branch of the PR.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default - Wil be created from master and named 'bump/$VERSION'
   */
  head?: AutoBumpHead

}

export class AutoBump extends cdk.Construct {

  /**
   * The underlying AutoPullRequest construct.
   */
  public readonly pr: AutoPullRequest;

  constructor(parent: cdk.Construct, id: string, props: AutoBumpProps) {
    super(parent, id);

    const branchName = props.head?.name ?? 'bump/$VERSION';
    const baseBranch = props.base?.name ?? 'master';
    const bumpCommand = props.bumpCommand ?? '/bin/sh ./bump.sh';
    const versionCommand = props.versionCommand ?? 'git describe';
    const title = props.title ?? 'chore(release): $VERSION';
    const body = props.body ?? `See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${branchName}/CHANGELOG.md)`;

    this.pr = new AutoPullRequest(this, 'AutoPullRequest', {
      ...props,
      head: {
        name: branchName,
        source: props.head?.source,
      },
      title,
      body,
      commands: [bumpCommand],
      exports: {
        ...props.exports,
        VERSION: versionCommand,
      },
      // check if base is already released
      condition: `git describe --exact-match ${baseBranch}`,
    });

  }
}
