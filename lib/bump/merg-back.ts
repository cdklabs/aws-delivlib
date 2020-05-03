import { core as cdk } from "monocdk-experiment";
import { BuildEnvironmentProps } from "../build-env";
import { WritableGitHubRepo } from "../repo";
import * as pr from './pr';

export interface AutoMergeBackOptions {

  /**
   * The command to determine the current version.
   *
   * @default 'git describe'
   */
  versionCommand?: string;

  build?: BuildEnvironmentProps

  from?: string

  to?: string

  labels?: string[]

}

export interface AutoMergeBackProps extends AutoMergeBackOptions {

  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;
}

export class AutoMergeBack extends cdk.Construct {

  constructor(parent: cdk.Construct, id: string, props: AutoMergeBackProps) {
    super(parent, id);

    const versionCommand = props.versionCommand ?? 'git describe';
    const headName = 'merge-back/$VERSION';
    const headHash = props.from ?? 'release';
    const base = props.to ?? 'master';
    const title = `chore(release): merge ${headHash}/$VERSION to ${base}`;
    const body = `## Commit Message
${title} (#$PR_NUMBER)

See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${headName}/CHANGELOG.md)

## End Commit Message`;

    new pr.AutoPullRequest(this, 'AutoMergeBack', {
      repo: props.repo,
      pr: {
        body,
        title,
        head: pr.Branch.create({
          name: headName,
          hash: headHash
        }),
        base: pr.Branch.use(base),
        labels: props.labels ?? []
      },
      exports: {
        'VERSION': versionCommand
      },
      build: props.build
    });
  }
}