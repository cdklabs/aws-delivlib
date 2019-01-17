import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import events = require('@aws-cdk/aws-events');
import cdk = require('@aws-cdk/cdk');

import { Shellable, ShellableProps } from './shellable';

export interface CanaryProps extends ShellableProps {
  /**
   * Rate at which to run the canary test.
   *
   * @default 'rate(1 minute)'
   */
  scheduleExpression: string;
}

/**
 * Schedules a script to run periodically in CodeBuild and exposes an alarm
 * for failures. Ideal for running 'canary' scripts.
 *
 * If not explicitly defined in `environmentVariables`, IS_CANARY is set to "true".
 */
export class Canary extends cdk.Construct {
  public readonly alarm: cloudwatch.Alarm;
  public readonly project: cbuild.Project;

  constructor(scope: cdk.Construct, id: string, props: CanaryProps) {
    super(scope, id);

    const env = props.env || { };
    if (!('IS_CANARY' in env)) {
      env.IS_CANARY = 'true';
    }

    const shellable = new Shellable(this, 'Shellable', {
      ...props,
      env,
      source: new cbuild.NoSource()
    });

    new events.EventRule(this, `Schedule`, {
      scheduleExpression: props.scheduleExpression,
      targets: [shellable.project]
    });

    this.alarm = new cloudwatch.Alarm(this, `Alarm`, {
      metric: shellable.project.metricFailedBuilds({
        periodSec: 300
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GreaterThanOrEqualToThreshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.Ignore
    });

    this.project = shellable.project;
  }
}
