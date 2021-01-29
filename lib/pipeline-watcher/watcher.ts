import * as path from 'path';
import {
  Construct,
  aws_cloudwatch as cloudwatch,
  aws_codepipeline as cpipeline,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
} from 'monocdk';

export interface PipelineWatcherProps {
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

    const metricNamespace = 'CDK/Delivlib';
    const metricName = 'Failures';

    const pipelineWatcher = new lambda.Function(this, 'Poller', {
      handler: 'watcher-handler.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'handler')),
      environment: {
        METRIC_NAMESPACE: metricNamespace,
        METRIC_NAME: metricName,
      },
    });

    pipelineWatcher.addToRolePolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['cloudwatch:PutMetricData'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': metricNamespace,
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
        metricName,
        namespace: metricNamespace,
        statistic: cloudwatch.Statistic.MAXIMUM,
        dimensions: {
          Pipeline: props.pipeline.pipelineName,
        },
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
  }
}
