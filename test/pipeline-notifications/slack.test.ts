import '@monocdk-experiment/assert/jest';
import {
  App, Stack,
  aws_codecommit as codecommit,
  aws_codepipeline as cpipeline,
  aws_chatbot as chatbot,
} from 'monocdk';
import { Pipeline, CodeCommitRepo, SlackNotification } from '../../lib';

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

    // THEN
    expect(stack).toHaveResource('AWS::CodeStarNotifications::NotificationRule', {
      DetailType: 'BASIC',
      EventTypeIds: ['codepipeline-pipeline-action-execution-failed'],
      Name: {
        'Fn::Join': [
          '',
          [
            {
              Ref: 'PipelineBuildPipeline04C6628A',
            },
            '-failednotifications',
          ],
        ],
      },
      Resource: stack.resolve((pipe.node.findChild('BuildPipeline') as cpipeline.Pipeline).pipelineArn),
      Targets: [
        {
          TargetAddress: stack.resolve(slackChannel.slackChannelConfigurationArn),
          TargetType: 'AWSChatbotSlack',
        },
      ],
    });
  });
});