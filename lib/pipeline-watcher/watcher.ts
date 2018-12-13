import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import events = require('@aws-cdk/aws-events');
import iam = require('@aws-cdk/aws-iam');
import lambda = require('@aws-cdk/aws-lambda');
import logs = require('@aws-cdk/aws-logs');
import cdk = require('@aws-cdk/cdk');
import fs = require('fs');
import path = require('path');

export interface PipelineWatcherProps {
  /**
   * Code Pipeline to monitor for failed stages
   */
  pipeline: cpipeline.Pipeline;

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
export class PipelineWatcher extends cdk.Construct {
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: cdk.Construct, name: string, props: PipelineWatcherProps) {
    super(parent, name);

    const pipelineWatcher = new lambda.Function(this, 'Poller', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NodeJS810,
      code: lambda.Code.inline(fs.readFileSync(path.join(__dirname, 'watcher-handler.js')).toString('utf8')),
      environment: {
        PIPELINE_NAME: props.pipeline.pipelineName
      }
    });

    // See https://github.com/awslabs/aws-cdk/issues/1340 for exposing grants on the pipeline.
    pipelineWatcher.addToRolePolicy(new iam.PolicyStatement()
      .addResource(props.pipeline.pipelineArn)
      .addAction('codepipeline:GetPipelineState'));

    // ex: arn:aws:logs:us-east-1:123456789012:log-group:my-log-group
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/aws/lambda/${pipelineWatcher.functionName}`,
      retentionDays: 731
    });

    const trigger = new events.EventRule(this, 'Trigger', {
      scheduleExpression: 'rate(1 minute)',
      targets: [pipelineWatcher]
    });

    const logGroupResource = logGroup.findChild('Resource') as cdk.Resource;
    const triggerResource = trigger.findChild('Resource') as cdk.Resource;
    triggerResource.addDependency(logGroupResource);

    const metricName = 'FailedStages';
    // TODO: This creates a long namespace, better alternatives?
    const metricNamespace =  `CodePipeline/${props.pipeline.pipelineName}`;

    new logs.MetricFilter(this, 'MetricFilter', {
      filterPattern: logs.FilterPattern.exists('$.failedCount'),
      metricNamespace,
      metricName,
      metricValue: '$.failedCount',
      logGroup
    });

    this.alarm = new cloudwatch.Alarm(this, 'Alarm', {
      alarmDescription: `Pipeline ${props.title || props.pipeline.pipelineName} has failed stages`,
      metric: new cloudwatch.Metric({
        metricName,
        namespace: metricNamespace,
        statistic: cloudwatch.Statistic.Maximum
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GreaterThanOrEqualToThreshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.Ignore, // We expect a steady stream of data points
    });
  }
}