import {
  App, Stack,
  aws_codecommit as codecommit,
  aws_chatbot as chatbot,
} from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Pipeline, CodeCommitRepo, SlackNotification } from '../../../lib';

describe('slack notifications', () => {
  test('failure notification via slack', () => {
    // GIVEN
    const stack = new Stack(new App(), 'TestStack');
    const slackChannel = new chatbot.SlackChannelConfiguration(stack, 'notify', {
      slackChannelConfigurationName: 'test-slack-config',
      slackChannelId: 'test-channel-id',
      slackWorkspaceId: 'test-workspace-id',
    });
    const pipe = new Pipeline(stack, 'Pipeline', {
      repo: new CodeCommitRepo(new codecommit.Repository(stack, 'Repo1', { repositoryName: 'test' })),
    });

    // WHEN
    pipe.notifyOnFailure(new SlackNotification({ channels: [slackChannel] }));
    const template = Template.fromStack(stack);

    // THEN
    template.hasResourceProperties('AWS::CodeStarNotifications::NotificationRule', {
      DetailType: 'BASIC',
      EventTypeIds: ['codepipeline-pipeline-action-execution-failed'],
      Name: {
        'Fn::Join': [
          '',
          [
            {
              Ref: 'PipelineBuildPipeline04C6628A',
            },
            '-06cc6a8b3242c01f0cffbd9626c6a84d',
          ],
        ],
      },
      Resource: stack.resolve(pipe.pipeline.pipelineArn),
      Targets: [
        {
          TargetAddress: stack.resolve(slackChannel.slackChannelConfigurationArn),
          TargetType: 'AWSChatbotSlack',
        },
      ],
    });
  });

  test('multiple notifications', () => {
    // GIVEN
    const stack = new Stack(new App(), 'TestStack');
    const slackChannel1 = new chatbot.SlackChannelConfiguration(stack, 'slack1', {
      slackChannelConfigurationName: 'test-slack-config-1',
      slackChannelId: 'test-channel-id-1',
      slackWorkspaceId: 'test-workspace-id-1',
    });
    const slackChannel2 = new chatbot.SlackChannelConfiguration(stack, 'slack2', {
      slackChannelConfigurationName: 'test-slack-config-2',
      slackChannelId: 'test-channel-id-2',
      slackWorkspaceId: 'test-workspace-id-2',
    });
    const pipe = new Pipeline(stack, 'Pipeline', {
      repo: new CodeCommitRepo(new codecommit.Repository(stack, 'Repo1', { repositoryName: 'test' })),
    });

    // WHEN
    pipe.notifyOnFailure(new SlackNotification({ channels: [slackChannel1] }));
    pipe.notifyOnFailure(new SlackNotification({ channels: [slackChannel2] }));
    const template = Template.fromStack(stack);

    // THEN
    template.hasResourceProperties('AWS::CodeStarNotifications::NotificationRule', {
      Targets: [
        {
          TargetAddress: stack.resolve(slackChannel1.slackChannelConfigurationArn),
          TargetType: 'AWSChatbotSlack',
        },
      ],
    });
    template.hasResourceProperties('AWS::CodeStarNotifications::NotificationRule', {
      Targets: [
        {
          TargetAddress: stack.resolve(slackChannel2.slackChannelConfigurationArn),
          TargetType: 'AWSChatbotSlack',
        },
      ],
    });
  });
});
