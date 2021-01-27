import { CodePipelineActionStateChangeEvent, cloudwatch, handler } from '../lib/pipeline-watcher/handler/watcher-handler';

cloudwatch.putMetricData = jest.fn();

function event(
  state: 'STARTED' | 'CANCELED' | 'FAILED' | 'SUCCEEDED' = 'SUCCEEDED',
): AWSLambda.EventBridgeEvent<'CodePipeline Action Execution State Change', CodePipelineActionStateChangeEvent> {
  return {
    'id': 'some-id',
    'version': '1',
    'account': '0123456789',
    'resources': ['some-resource'],
    'time': '2021-01-27T12:44:00Z',
    'detail-type': 'CodePipeline Action Execution State Change',
    'region': 'us-east-1',
    'source': 'aws.codepipeline',
    'detail': {
      action: 'some-action',
      pipeline: 'some-pipeline',
      state,
    },
  };
}

describe('watcher-handler', () => {
  beforeEach(() => {
    process.env.METRIC_NAME = 'metricName';
    process.env.METRIC_NAMESPACE = 'metricNamespace';
  });

  test('throws an error if PutMetricData fails', async () => {
    expect.assertions(1);
    cloudwatch.putMetricData = jest.fn(_request => {
      return {
        promise: () => new Promise((_, reject) => reject(new Error('fail'))),
      };
    }) as any;
    try {
      await handler(event());
    } catch (err) {
      expect(err.message).toEqual('fail');
    }
  });

  test('throws an error if METRIC_NAME is undefined', async () => {
    delete process.env.METRIC_NAME;
    expect.assertions(1);
    try {
      await handler(event());
    } catch (err) {
      expect(err.message).toMatch(/environment variables must be set/);
    }
  });

  test('throws an error if METRIC_NAMESPACE is undefined', async () => {
    delete process.env.METRIC_NAMESPACE;
    expect.assertions(1);
    try {
      await handler(event());
    } catch (err) {
      expect(err.message).toMatch(/environment variables must be set/);
    }
  });

  test('throws an error if state is not SUCCEEDED or FAILED', async () => {
    expect.assertions(1);
    try {
      await handler(event('STARTED'));
    } catch (err) {
      expect(err.message).toMatch(/Unsupported/);
    }
  });

  test('reports FAILED state metrics', async () => {
    expect.assertions(1);
    cloudwatch.putMetricData = jest.fn(request => {
      expect(request).toEqual({
        Namespace: 'metricNamespace',
        MetricData: [
          {
            MetricName: 'metricName',
            Value: 1,
            Dimensions: [
              {
                Name: 'Pipeline',
                Value: 'some-pipeline',
              },
              {
                Name: 'Action',
                Value: 'some-action',
              },
            ],
            Timestamp: new Date(1611751440000),
          },
        ],
      });
      return {
        promise: () => new Promise((resolve, _) => resolve({})),
      };
    }) as any;
    await handler(event('FAILED'));
  });

  test('reports SUCCEEDED state metrics', async () => {
    expect.assertions(1);
    cloudwatch.putMetricData = jest.fn(request => {
      expect(request).toEqual({
        Namespace: 'metricNamespace',
        MetricData: [
          {
            MetricName: 'metricName',
            Value: 0,
            Dimensions: [
              {
                Name: 'Pipeline',
                Value: 'some-pipeline',
              },
              {
                Name: 'Action',
                Value: 'some-action',
              },
            ],
            Timestamp: new Date(1611751440000),
          },
        ],
      });
      return {
        promise: () => new Promise((resolve, _) => resolve({})),
      };
    }) as any;
    await handler(event('SUCCEEDED'));
  });
});