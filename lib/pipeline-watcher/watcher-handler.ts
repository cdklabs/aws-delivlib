import * as AWS from 'aws-sdk';

// Partial type for the 'detail' section of an event from Amazon EventBridge for 'CodePipeline Action Execution State Change'
// See https://docs.aws.amazon.com/eventbridge/latest/userguide/event-types.html#codepipeline-event-type
interface CodePipelineActionStateChangeEvent {
  readonly pipeline: string;
  readonly action: string;
  readonly state: 'STARTED' | 'CANCELED' | 'FAILED' | 'SUCCEEDED';
}

// export for tests
export const cloudwatch = new AWS.CloudWatch();
export const logger = {
  log: (line: string) => process.stdout.write(line),
};

/**
 * Lambda function for checking the stages of a CodePipeline and emitting log
 * entries with { failedCount = <no. of failed stages> } for async metric
 * aggregation via metric filters.
 *
 * It requires the pipeline's name be set as the 'PIPELINE_NAME' environment variable.
 */
export async function handler(event: AWSLambda.EventBridgeEvent<'CodePipeline Action Execution State Change', CodePipelineActionStateChangeEvent>) {
  logger.log(`Received event: ${JSON.stringify(event)}`);

  const metricNamespace = process.env.METRIC_NAMESPACE;
  const metricName = process.env.METRIC_NAME;
  const pipelineName = event.detail.pipeline;
  const action = event.detail.action;
  const state = event.detail.state;
  const time = new Date(event.time);

  if (!metricNamespace || !metricName) {
    throw new Error('Both METRIC_NAMESPACE and METRIC_NAME environment variables must be set.');
  }

  let value: number;
  switch (state) {
    case 'FAILED': value = 1; break;
    case 'SUCCEEDED': value = 0; break;
    default: throw new Error('Only FAILED and SUCCEEDED states are supported. Others must be filtered out prior to this function.');
  }

  logger.log(`Calling PutMetricData with payload: ${JSON.stringify(event)}`);
  const input: AWS.CloudWatch.PutMetricDataInput = {
    Namespace: metricNamespace,
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Dimensions: [
          {
            Name: 'Pipeline',
            Value: pipelineName,
          },
          {
            Name: 'Action',
            Value: action,
          },
        ],
        Timestamp: time,
      },
    ],
  };

  await cloudwatch.putMetricData(input).promise();
  logger.log('Done');
}
