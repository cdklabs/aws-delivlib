import * as path from 'path';
import {
  aws_cloudwatch as cloudwatch,
  aws_codepipeline as cpipeline,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PipelineWatcherProps {
  /**
   * The CloudWatch metric namespace to which metrics should be sent
   */
  metricNamespace: string;

  /**
   * The CloudWatch metric name for failures.
   */
  failureMetricName: string;

  /**
   * Code Pipeline to monitor for failed stages
   */
  pipeline: cpipeline.IPipeline;

  /**
   * Set the pipelineName of the alarm description.
   *
   * Description is set to 'Pipeline <title> has failed stages'
   *
   * @default pipeline's name
   */
  title?: string;
}

/**
 * Construct which watches a Code Pipeline for failed stages and raises an alarm
 * if there are any failed stages.
 *
 * A function runs every minute and calls GetPipelineState for the provided pipeline's
 * name, counts the number of failed stages and emits a JSON log { failedCount: <number> }.
 * A metric filter is then configured to track this value as a CloudWatch metric, and
 * a corresponding alarm is set to fire when the maximim value of a single 5-minute interval
 * is >= 1.
 */
export class PipelineWatcher extends Construct {
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: Construct, name: string, props: PipelineWatcherProps) {
    super(parent, name);

    const pipelineWatcher = new lambda.Function(this, 'Poller', {
      handler: 'watcher-handler.handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'handler')),
      environment: {
        METRIC_NAMESPACE: props.metricNamespace,
        METRIC_NAME: props.failureMetricName,
      },
    });

    pipelineWatcher.addToRolePolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['cloudwatch:PutMetricData'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': props.metricNamespace,
        },
      },
    }));

    new events.Rule(this, 'Trigger', {
      eventPattern: {
        source: ['aws.codepipeline'],
        resources: [props.pipeline.pipelineArn],
        detailType: [
          'CodePipeline Action Execution State Change',
          'CodePipeline Pipeline Execution State Change',
        ],
        detail: {
          state: ['FAILED', 'SUCCEEDED'],
        },
      },
      targets: [new events_targets.LambdaFunction(pipelineWatcher)],
    });

    this.alarm = new cloudwatch.Alarm(this, 'Alarm', {
      alarmDescription: `Pipeline ${props.title || props.pipeline.pipelineName} has failed stages`,
      metric: new cloudwatch.Metric({
        metricName: props.failureMetricName,
        namespace: props.metricNamespace,
        statistic: cloudwatch.Statistic.MAXIMUM,
        dimensionsMap: {
          Pipeline: props.pipeline.pipelineName,
        },
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      // IGNORE missing data, so the alarm stays in its current state, until the next data point.
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
  }
}
