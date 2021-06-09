// eslint-disable-next-line import/no-extraneous-dependencies
import * as AWS from 'aws-sdk';

// Partial type for the 'detail' section of an event from Amazon EventBridge for 'CodePipeline Execution State Change'
// See https://docs.aws.amazon.com/eventbridge/latest/userguide/event-types.html#codepipeline-event-type
export interface ExecutionStateChangeEvent {
  readonly pipeline: string;
  readonly state: 'STARTED' | 'CANCELED' | 'FAILED' | 'SUCCEEDED';
}

// Partial type for the 'detail' section of an event from Amazon EventBridge for 'CodePipeline Action Execution State Change'
// See https://docs.aws.amazon.com/eventbridge/latest/userguide/event-types.html#codepipeline-event-type
export interface ActionStateChangeEvent extends ExecutionStateChangeEvent {
  readonly action: string;
}

export type LambdaExecutionStateChangeEvent = AWSLambda.EventBridgeEvent<'CodePipeline Pipeline Execution State Change', ExecutionStateChangeEvent>;
export type LambdaActionStateChangeEvent = AWSLambda.EventBridgeEvent<'CodePipeline Action Execution State Change', ActionStateChangeEvent>;
export type EventType = LambdaExecutionStateChangeEvent | LambdaActionStateChangeEvent;

// export for tests
export const cloudwatch = new AWS.CloudWatch();
const logger = {
  log: (line: string) => process.stdout.write(line),
};

/**
 * Lambda function that reacts to an Amazon EventBridge event triggered by a 'CodePipeline Action Execution State Change'.
 * The handler reads the event and sends off metrics to CloudWatch.
 */
export async function handler(event: EventType) {
  logger.log(`Received event: ${JSON.stringify(event)}`);

  switch (event['detail-type']) {
    case 'CodePipeline Pipeline Execution State Change': await handleExecutionChange(event); break;
    case 'CodePipeline Action Execution State Change': await handleActionChange(event); break;
    default: throw new Error(`Unhandled detail type ${event['detaill-type']}`);
  }
}

async function handleExecutionChange(event: LambdaExecutionStateChangeEvent) {
  const pipelineName = event.detail.pipeline;
  const state = event.detail.state;

  let value: number;
  switch (state) {
    case 'FAILED': value = 1; break;
    case 'SUCCEEDED': value = 0; break;
    default: throw new Error(`Unsupported state: ${state}. Only FAILED and SUCCEEDED states are supported. ` +
    'Others must be filtered out prior to this function.');
  }

  await putMetric(event, value, [
    { Name: 'Pipeline', Value: pipelineName },
  ]);

  logger.log('Done');
}


async function handleActionChange(event: LambdaActionStateChangeEvent) {
  const pipelineName = event.detail.pipeline;
  const action = event.detail.action;
  const state = event.detail.state;

  let value: number;
  switch (state) {
    case 'FAILED': value = 1; break;
    case 'SUCCEEDED': value = 0; break;
    default: throw new Error(`Unsupported state: ${state}. Only FAILED and SUCCEEDED states are supported. ` +
    'Others must be filtered out prior to this function.');
  }

  await putMetric(event, value, [
    { Name: 'Pipeline', Value: pipelineName },
    { Name: 'Action', Value: action },
  ]);

  logger.log('Done');
}

async function putMetric(event: EventType, value: number, dimensions: AWS.CloudWatch.Dimensions) {
  const metricNamespace = process.env.METRIC_NAMESPACE;
  const metricName = process.env.METRIC_NAME;
  const time = new Date(event.time);

  if (!metricNamespace || !metricName) {
    throw new Error('Both METRIC_NAMESPACE and METRIC_NAME environment variables must be set.');
  }

  const input: AWS.CloudWatch.PutMetricDataInput = {
    Namespace: metricNamespace,
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Dimensions: dimensions,
        Timestamp: time,
      },
    ],
  };

  logger.log(`Calling PutMetricData with payload: ${JSON.stringify(input)}`);

  await cloudwatch.putMetricData(input).promise();
}