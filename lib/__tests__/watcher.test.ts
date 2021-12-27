import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Pipeline } from 'aws-cdk-lib/aws-codepipeline';
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
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Events::Rule', 1);
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
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
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmDescription: 'Pipeline MyTitle has failed stages',
    });
  });

  test('lambda function has the expected policy', () => {
    const stack = new Stack();
    const pipeline = Pipeline.fromPipelineArn(stack, 'Pipeline', 'arn:aws:codepipeline:us-east-1:012345789:MyPipeline');
    new PipelineWatcher(stack, 'Watcher', { pipeline, ...props });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
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

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      TreatMissingData: 'ignore',
    });
  });
});
