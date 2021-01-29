import { LambdaActionStateChangeEvent, LambdaExecutionStateChangeEvent, cloudwatch, handler } from '../lib/pipeline-watcher/handler/watcher-handler';

cloudwatch.putMetricData = jest.fn();

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
      await handler(actionExecutionEvent());
    } catch (err) {
      expect(err.message).toEqual('fail');
    }
  });

  test('throws an error if METRIC_NAME is undefined', async () => {
    delete process.env.METRIC_NAME;
    expect.assertions(1);
    try {
      await handler(actionExecutionEvent());
    } catch (err) {
      expect(err.message).toMatch(/environment variables must be set/);
    }
  });

  test('throws an error if METRIC_NAMESPACE is undefined', async () => {
    delete process.env.METRIC_NAMESPACE;
    expect.assertions(1);
    try {
      await handler(actionExecutionEvent());
    } catch (err) {
      expect(err.message).toMatch(/environment variables must be set/);
    }
  });

  describe('Action Execution State Change', () => {
    test('throws an error if state is not SUCCEEDED or FAILED', async () => {
      expect.assertions(1);
      try {
        await handler(actionExecutionEvent('STARTED'));
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
                { Name: 'Pipeline', Value: 'some-pipeline' },
                { Name: 'Action', Value: 'some-action' },
              ],
              Timestamp: new Date(1611751440000),
            },
          ],
        });
        return {
          promise: () => new Promise((resolve, _) => resolve({})),
        };
      }) as any;
      await handler(actionExecutionEvent('FAILED'));
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
                { Name: 'Pipeline', Value: 'some-pipeline' },
                { Name: 'Action', Value: 'some-action' },
              ],
              Timestamp: new Date(1611751440000),
            },
          ],
        });
        return {
          promise: () => new Promise((resolve, _) => resolve({})),
        };
      }) as any;
      await handler(actionExecutionEvent('SUCCEEDED'));
    });
  });

  describe('Pipeline Execution State Change', () => {
    test('throws an error if state is not SUCCEEDED or FAILED', async () => {
      expect.assertions(1);
      try {
        await handler(pipelineExecutionEvent('STARTED'));
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
                { Name: 'Pipeline', Value: 'some-pipeline' },
              ],
              Timestamp: new Date(1611751440000),
            },
          ],
        });
        return {
          promise: () => new Promise((resolve, _) => resolve({})),
        };
      }) as any;
      await handler(pipelineExecutionEvent('FAILED'));
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
                { Name: 'Pipeline', Value: 'some-pipeline' },
              ],
              Timestamp: new Date(1611751440000),
            },
          ],
        });
        return {
          promise: () => new Promise((resolve, _) => resolve({})),
        };
      }) as any;
      await handler(pipelineExecutionEvent('SUCCEEDED'));
    });
  });
});

function actionExecutionEvent(
  state: 'STARTED' | 'CANCELED' | 'FAILED' | 'SUCCEEDED' = 'SUCCEEDED',
): LambdaActionStateChangeEvent {
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

function pipelineExecutionEvent(
  state: 'STARTED' | 'CANCELED' | 'FAILED' | 'SUCCEEDED' = 'SUCCEEDED',
): LambdaExecutionStateChangeEvent {
  return {
    'id': 'some-id',
    'version': '1',
    'account': '0123456789',
    'resources': ['some-resource'],
    'time': '2021-01-27T12:44:00Z',
    'detail-type': 'CodePipeline Pipeline Execution State Change',
    'region': 'us-east-1',
    'source': 'aws.codepipeline',
    'detail': {
      pipeline: 'some-pipeline',
      state,
    },
  };
}