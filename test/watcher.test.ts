import '@monocdk-experiment/assert/jest';
import { Stack } from 'monocdk';
import { Pipeline } from 'monocdk/aws-codepipeline';
import { PipelineWatcher } from '../lib/pipeline-watcher';

describe('PipelineWatcher', () => {
  test('default', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline });

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
      MetricName: 'Failures',
      Namespace: 'CDK/Delivlib',
      Period: 300,
      Statistic: 'Maximum',
      Threshold: 1,
      TreatMissingData: 'ignore',
    });
  });

  test('title option is correctly handled', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, title: 'MyTitle' });

    expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
      AlarmDescription: 'Pipeline MyTitle has failed stages',
    });
  });

  test('lambda function has the expected policy', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline });

    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'cloudwatch:PutMetricData',
            Condition: {
              StringEquals: {
                'cloudwatch:namespace': 'CDK/Delivlib',
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
});