import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import events = require('@aws-cdk/aws-events');
import events_targets = require('@aws-cdk/aws-events-targets');
import cdk = require('@aws-cdk/core');

import { Shellable, ShellableProps } from './shellable';

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
