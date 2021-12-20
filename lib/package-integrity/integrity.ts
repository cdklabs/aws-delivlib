import * as path from 'path';
import {
  Construct,
  aws_cloudwatch as cloudwatch,
  aws_codebuild as codebuild,
  aws_events as events,
  aws_events_targets as targets,
  aws_secretsmanager as sm,
  Duration,
} from 'monocdk';
import { LinuxPlatform, Shellable } from '../shellable';

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
  readonly githubTokenSecret: sm.ISecret;

  /**
   * The build image to use. This is important because the source code will be built inside this image.
   * So its important this image matches the one used when releasing the package.
   */
  readonly buildImage: codebuild.IBuildImage;

  /**
   * Run the validation on a schedule.
   *
   * @default - once a day.
   */
  readonly schedule?: events.Schedule;

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

    const shellable = new Shellable(this, 'Default', {
      scriptDirectory: path.join(__dirname, 'handler'),
      entrypoint: 'validate.sh',
      privileged: props.privileged ?? false,
      platform: new LinuxPlatform(props.buildImage),
      environment: {
        GITHUB_REPOSITORY: props.repository,
        TAG_PREFIX: props.tagPrefix ?? '',
        GITHUB_TOKEN_ARN: props.githubTokenSecret.secretArn,
        PACK_TASK: props.packTask,
      },
    });

    props.githubTokenSecret.grantRead(shellable.role);

    new events.Rule(this, 'ScheduledTrigger', {
      schedule: props.schedule ?? events.Schedule.rate(Duration.days(1)),
      targets: [new targets.CodeBuildProject(shellable.project)],
    });

    this.failureAlarm = shellable.alarm;

  }
}
