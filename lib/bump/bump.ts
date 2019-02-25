import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import events = require('@aws-cdk/aws-events');
import cdk = require('@aws-cdk/cdk');
import { createBuildEnvironment } from '../build-env';
import permissions = require('../permissions');
import { WritableGitHubRepo } from '../repo';

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
   * @default superchain (see docs)
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
   * @default the commit will be pushed to the branch `bump/$(git describe)`
   */
  branch?: string;
}

export interface AutoBumpProps extends AutoBumpOptions {
  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;
}

export class AutoBump extends cdk.Construct {

  /**
   * CloudWatch alarm that will be triggered if bump fails.
   */
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: cdk.Construct, id: string, props: AutoBumpProps) {
    super(parent, id);

    const bumpCommand = props.bumpCommand || '/bin/sh ./bump.sh';
    const sshKeySecret = props.repo.sshKeySecret;

    if (!sshKeySecret) {
      throw new Error(`Cannot install auto-bump on a repo without an SSH key secret`);
    }

    const commitEmail = props.repo.commitEmail;
    if (!commitEmail) {
      throw new Error(`Cannot install auto-bump on a repo without "commitEmail"`);
    }

    const commitUsername = props.repo.commitUsername;
    if (!commitUsername) {
      throw new Error(`Cannot install auto-bump on a repo without "commitUsername"`);
    }

    const pushCommands = new Array<string>();

    pushCommands.push(...[
      `BRANCH=bump/$(git describe)`,
      `git branch -D $BRANCH || true`,                    // force delete the branch if it already exists
      `git checkout -b $BRANCH`,                          // create a new branch from HEAD
    ]);

    // if we want to merge this to a branch automatically, then check out the branch and merge
    if (props.branch) {
      pushCommands.push(...[
        `git checkout ${props.branch}`,
        `git merge $BRANCH`
      ]);
    }

    // add "origin" remote
    pushCommands.push(`git remote add origin_ssh ${props.repo.repositoryUrlSsh}`);

    // now push either to our bump branch or the destination branch
    const targetBranch = props.branch || '$BRANCH';
    pushCommands.push(`git push --follow-tags origin_ssh ${targetBranch }`);

    const project = new cbuild.Project(this, 'Bump', {
      source: props.repo.createBuildSource(this),
      environment: createBuildEnvironment(this, props),
      buildSpec: {
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
              bumpCommand,
              `aws secretsmanager get-secret-value --secret-id "${sshKeySecret.secretArn}" --output=text --query=SecretString > ~/.ssh/id_rsa`,
              `chmod 0600 ~/.ssh/id_rsa`,
              ...pushCommands
            ]
          },
        }
      }
    });

    if (project.role) {
      permissions.grantSecretRead(sshKeySecret, project.role);
    }

    // set up the schedule
    const schedule = props.scheduleExpression === undefined ? 'cron(0 12 * * ? *)' : props.scheduleExpression;
    if (schedule !== 'disable') {
      new events.EventRule(this, 'Scheduler', {
        description: 'Schedules an automatic bump for this repository',
        scheduleExpression: schedule,
        targets: [ project ]
      });
    }

    this.alarm = project.metricFailedBuilds({ periodSec: 300 }).newAlarm(this, 'BumpFailedAlarm', {
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.Ignore
    });
  }
}