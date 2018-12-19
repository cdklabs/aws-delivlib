import cbuild = require('@aws-cdk/aws-codebuild');
import events = require('@aws-cdk/aws-events');
import cdk = require('@aws-cdk/cdk');
import { createBuildEnvironment } from '../build-env';
import permissions = require('../permissions');
import { WritableGitHubRepo } from '../repo';

export interface AutoBumpProps {
  /**
   * The repository to bump.
   */
  repo: WritableGitHubRepo;

  /**
   * The command to execute in order to bump the repo.
   *
   * The bump command is responsible to bump any version metadata, update
   * CHANGELOG and commit this to the repository.
   *
   * @default "/bin/sh ./bump.sh"
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
}

export class AutoBump extends cdk.Construct {
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
              bumpCommand
            ]
          },
          post_build: {
            commands: [
              'find ${CODEBUILD_SRC_DIR_BUMPSCRIPTS}',
              `aws secretsmanager get-secret-value --secret-id "${sshKeySecret.secretArn}" --output=text --query=SecretString > ~/.ssh/id_rsa`,
              `chmod 0600 ~/.ssh/id_rsa`,
              `git branch -D bump/$(git describe) || true`,                    // force delete the branch if it already exists
              `git checkout -b bump/$(git describe)`,                          // create a new branch from HEAD
              `git remote add origin_ssh ${props.repo.repositoryUrlSsh}`,      // add origin as ssh url
              `git push --force --follow-tags origin_ssh bump/$(git describe)` // push!
            ]
          }
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
  }
}