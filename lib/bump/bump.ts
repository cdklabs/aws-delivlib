import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, core as cdk } from "monocdk-experiment";
import { WritableGitHubRepo } from "../repo";
import { AutoPullRequest, Branch } from './pr';

export interface AutoBumpOptions {
  /**
   * The command to execute in order to bump the repo.
   *
   * The bump command is responsible to bump any version metadata, update
   * CHANGELOG and commit this to the repository.
   *
   * @default "/bin/bash ./bump.sh"
   */
  bumpCommand?: string;

  /**
   * The command to determine the current version.
   * @default "git describe" by default the latest git tag will be used to determine the current version
   */
  versionCommand?: string;

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

  /**
   * The image used for the builds.
   *
   * @default jsii/superchain (see docs)
   */
  buildImage?: cbuild.IBuildImage;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default taken from {@link #buildImage#defaultComputeType}
   */
  computeType?: cbuild.ComputeType;

  /**
   * Indicates how the project builds Docker images. Specify true to enable
   * running the Docker daemon inside a Docker container. This value must be
   * set to true only if this build project will be used to build Docker
   * images, and the specified build environment image is not one provided by
   * AWS CodeBuild with Docker support. Otherwise, all associated builds that
   * attempt to interact with the Docker daemon will fail.
   *
   * @default false
   */
  privileged?: boolean;

  /**
   * Environment variables to pass to build
   */
  env?: { [key: string]: string };

  /**
   * The name of the branch to push the bump commit (e.g. "master")
   * This branch has to exist.
   *
   * @default - the commit will be pushed to the branch `bump/$VERSION`
   */
  branch?: string;

  /**
   * Create a pull request after the branch is pushed.
   * However, if there are no code changes after the bump is complete,
   * no pull request will be created.
   *
   * @default - true if `pullRequestOptions` is specified, `false` otherwise.
   */
  pullRequest?: boolean;

  /**
   * Options for pull request
   *
   * @default - default options
   */
  pullRequestOptions?: PullRequestOptions;

  /**
   * Git clone depth
   *
   * @default 0 clones the entire repository
   */
  cloneDepth?: number;
}

export interface AutoBumpProps extends AutoBumpOptions {
  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;
}

export interface PullRequestOptions {
  /**
   * The title of the pull request.
   *
   * $VERSION will be substituted by the current version (obtained by executing `versionCommand`).
   *
   * @default "chore(release): $VERSION"
   */
  title?: string;

  /**
   * The PR body.
   * @default "see CHANGELOG"
   */
  body?: string;

  /**
   * Base branch
   * @default "master"
   */
  base?: string;
}

export class AutoBump extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: cdk.Construct, id: string, props: AutoBumpProps) {
    super(parent, id);

    const bumpCommand = props.bumpCommand || '/bin/sh ./bump.sh';
    const versionCommand = props.versionCommand ?? 'git describe';
    const title = props.pullRequestOptions?.title ?? 'chore(release): $VERSION';
    const body = props.pullRequestOptions?.body ?? `## Commit Message
${title} (#$PR_NUMBER)

See [CHANGELOG](https://github.com/${props.repo.owner}/${props.repo.repo}/blob/${headName}/CHANGELOG.md)

## End Commit Message`;
    const base = props.pullRequestOptions?.base ?? 'master';
    const pullRequestEnabled = props.pullRequest || props.pullRequestOptions !== undefined;
    const cloneDepth = props.cloneDepth === undefined ? 0 : props.cloneDepth;

    const autoBump = new AutoPullRequest(this, 'AutoBump', {
      repo: props.repo,
      pr: {
        body,
        title,
        head: props.branch? Branch.use(props.branch) : Branch.create({
          name: 'bump/$VERSION',
          hash: 'master'
        }),
        base: Branch.use(base),
      },
      commits: [bumpCommand],
      pushOnly: !pullRequestEnabled,
      scheduleExpression: props.scheduleExpression === 'disable' ? undefined : 'cron(0 12 * * ? *)',
      cloneDepth,
      exports: {
        'VERSION': versionCommand
      },
      build: {
        buildImage: props.buildImage,
        computeType: props.computeType,
        env: props.env,
        privileged: props.privileged
      },
      condition: 'git describe --exact-match HEAD'
    });

    this.alarm = autoBump.alarm;
  }
}