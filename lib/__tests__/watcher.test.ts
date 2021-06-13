import '@monocdk-experiment/assert/jest';
import { Stack } from 'monocdk';
import { Pipeline } from 'monocdk/aws-codepipeline';
import { PipelineWatcher } from '../../lib/pipeline-watcher';

const props = {
  metricNamespace: 'Namespace',
  failureMetricName: 'FailureMetricName',
};

describe('PipelineWatcher', () => {
  test('default', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, ...props });

    expect(stack).toHaveResource('AWS::Events::Rule');
    expect(stack).toHaveResource('AWS::Lambda::Function');
    expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      EvaluationPeriods: 1,
      AlarmDescription: 'Pipeline MyPipeline has failed stages',
      Dimensions: [
        {
          Name: 'Pipeline',
          Value: 'MyPipeline',
        },
      ],
      MetricName: 'FailureMetricName',
      Namespace: 'Namespace',
      Period: 300,
      Statistic: 'Maximum',
      Threshold: 1,
    });
  });

  test('title option is correctly handled', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, title: 'MyTitle', ...props });

    expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
      AlarmDescription: 'Pipeline MyTitle has failed stages',
    });
  });

  test('lambda function has the expected policy', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, ...props });

    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'cloudwatch:PutMetricData',
            Condition: {
              StringEquals: {
                'cloudwatch:namespace': 'Namespace',
              },
            },
            Effect: 'Allow',
            Resource: '*',
          },
        ],
      },
      Roles: [
        {
          Ref: 'WatcherPollerServiceRole04A8CDED',
        },
      ],
    });
  });

  test('missing data should be treated as ignore', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, ...props });

    expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
      TreatMissingData: 'ignore',
    });
  });
});