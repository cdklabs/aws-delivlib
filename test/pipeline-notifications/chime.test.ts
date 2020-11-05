import { stringLike } from '@monocdk-experiment/assert';
import '@monocdk-experiment/assert/jest';
import {
  App, Stack,
  aws_codecommit as codecommit,
  aws_codepipeline as cpipeline,
} from 'monocdk';
import { Pipeline, CodeCommitRepo, ChimeNotification } from '../../lib';

describe('slack notifications', () => {
  test('failure notification via chime', () => {
    // GIVEN
    const stack = new Stack(new App(), 'TestStack');
    const pipe = new Pipeline(stack, 'Pipeline', {
      repo: new CodeCommitRepo(new codecommit.Repository(stack, 'Repo1', { repositoryName: 'test' })),
    });

    // WHEN
    pipe.notifyOnFailure(new ChimeNotification({
      webhookUrls: ['url-1'],
    }));

    // THEN
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.codepipeline'],
        resources: [
          stack.resolve((pipe.node.findChild('BuildPipeline') as cpipeline.Pipeline).pipelineArn),
        ],
      },
      Targets: [
        {
          InputTransformer: {
            InputTemplate: stringLike('*url-1*'),
          },
        },
      ],
    });
  });
});