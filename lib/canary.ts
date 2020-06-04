import { aws_cloudwatch as cloudwatch, aws_codebuild as cbuild, aws_events as events,
  aws_events_targets as events_targets } from "monocdk-experiment";
import * as cdk from 'monocdk-experiment';
import { Shellable, ShellableProps } from "./shellable";




export interface CanaryProps extends ShellableProps {
  /**
   * Rate at which to run the canary test.
   *
   * @default every 1 minute
   */
  schedule: events.Schedule;
}

/**
 * Schedules a script to run periodically in CodeBuild and exposes an alarm
 * for failures. Ideal for running 'canary' scripts.
 *
 * If not explicitly defined in `environmentVariables`, IS_CANARY is set to "true".
 */
export class Canary extends cdk.Construct {
  public readonly alarm: cloudwatch.IAlarm;
  public readonly project: cbuild.IProject;

  constructor(scope: cdk.Construct, id: string, props: CanaryProps) {
    super(scope, id);

    const env = props.environment || { };
    if (!('IS_CANARY' in env)) {
      env.IS_CANARY = 'true';
    }

    const shellable = new Shellable(this, 'Shellable', {
      ...props,
      environment: env,
    });

    new events.Rule(this, `Schedule`, {
      schedule: props.schedule || events.Schedule.expression('rate(1 minute)'),
      targets: [new events_targets.CodeBuildProject(shellable.project)],
    });

    this.alarm = shellable.alarm;
    this.project = shellable.project;
  }
}
