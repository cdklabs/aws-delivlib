import * as path from 'path';
import {
  aws_cloudwatch as cloudwatch,
  aws_events as events,
  aws_events_targets as targets,
  aws_secretsmanager as sm,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Shellable, ShellPlatform } from '../shellable';

/**
 * Properties for `PackageIntegrityValidation`.
 */
export interface PackageIntegrityValidationProps {

  /**
   * The repository slug of the package (i.e cdklabs/jsii-docgen)
   */
  readonly repository: string;

  /**
   * Secret containing a github token.
   */
  readonly githubTokenSecret?: sm.ISecret;

  /**
   * The build platform to use. This platform should contain all necessary tools to package the artifacts
   * in the repository. Note that by default, this also means running the tests.
   *
   * @default ShellPlatform.LinuxUbuntu
   */
  readonly buildPlatform?: ShellPlatform;

  /**
   * How often to run the validation.
   *
   * @default - once a day.
   */
  readonly rate?: Duration;

  /**
   * How many consecutive failures should cause the monitor to go into alarm.
   *
   * @default 1
   */
  readonly consecutiveFailuresToAlarm?: number;

  /**
   * Wether or not the environment should be privileged, necessary to run container images.
   *
   * @default false
   */
  readonly privileged?: boolean;

  /**
   * Tag prefix for this specific validation. Only needed for repositories that either release
   * multiple packages or multiple major versions.
   *
   * @default - no prefix
   */
  readonly tagPrefix?: string;

  /**
   * The projen task that produces the local artifacts.
   *
   * @default 'release'
   */
  readonly packTask?: string;

  /**
   * Additional environment variables to set.
   *
   * @default - No additional environment variables
   */
  readonly environment?: { [key: string]: string | undefined };

  /**
   * Environment variables with secrets manager values. The values must be complete Secret Manager ARNs.
   *
   * @default no additional environment variables
   */
  readonly environmentSecrets?: { [key: string]: string };

  /**
   * Environment variables with SSM parameter values.
   *
   * @default no additional environment variables
   */
  readonly environmentParameters?: { [key: string]: string };
}

/**
 * Perform periodic integrity checks on published packages based on the
 * source code of the package. Currently supports only GitHub hosted packages.
 *
 * The check is done by downloading the published artifact, building the source code, and comparing the two.
 * If they differ, it means that of the following was compromised:
 *
 * - The publishing platform (for example GitHub runners)
 * - The artifact storage (for example npmjs.com)
 */
export class PackageIntegrityValidation extends Construct {

  /**
   * The alarm that will trigger if the validation fails.
   */
  public readonly failureAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: PackageIntegrityValidationProps) {
    super(scope, id);

    const rate = props.rate ?? Duration.days(1);

    const shellable = new Shellable(this, 'Default', {
      scriptDirectory: path.join(__dirname, 'handler'),
      entrypoint: 'validate.sh',
      privileged: props.privileged ?? false,
      platform: props.buildPlatform ?? ShellPlatform.LinuxUbuntu,
      environmentSecrets: props.environmentSecrets,
      environmentParameters: props.environmentParameters,
      environment: {
        ...props.environment,
        // always override the env vars we have explicit options for
        GITHUB_REPOSITORY: props.repository,
        TAG_PREFIX: props.tagPrefix ?? '',
        GITHUB_TOKEN_ARN: props.githubTokenSecret?.secretArn,
        PACK_TASK: props.packTask,
      },
      alarmPeriod: rate,
      alarmEvaluationPeriods: props.consecutiveFailuresToAlarm ?? 1,
    });

    if (props.githubTokenSecret) {
      const grant = props.githubTokenSecret.grantRead(shellable.role);
      grant.assertSuccess();
    }

    new events.Rule(this, 'ScheduledTrigger', {
      schedule: events.Schedule.rate(rate),
      targets: [new targets.CodeBuildProject(shellable.project)],
    });

    this.failureAlarm = shellable.alarm;

  }
}
