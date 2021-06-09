import { stringLike } from '@monocdk-experiment/assert';
import '@monocdk-experiment/assert/jest';
import {
  App, Stack,
  aws_codecommit as codecommit,
} from 'monocdk';
import { Pipeline, CodeCommitRepo, ChimeNotification } from '../../../lib';

describe('chime notifications', () => {
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
          stack.resolve(pipe.pipeline.pipelineArn),
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

  test('multiple chime notifications', () => {
    // GIVEN
    const stack = new Stack(new App(), 'TestStack');
    const pipe = new Pipeline(stack, 'Pipeline', {
      repo: new CodeCommitRepo(new codecommit.Repository(stack, 'Repo1', { repositoryName: 'test' })),
    });

    // WHEN
    pipe.notifyOnFailure(new ChimeNotification({
      webhookUrls: ['url-1'],
    }));

    pipe.notifyOnFailure(new ChimeNotification({
      webhookUrls: ['url-2'],
    }));

    // THEN
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      Targets: [
        {
          InputTransformer: {
            InputTemplate: stringLike('*url-1*'),
          },
        },
      ],
    });
    expect(stack).toHaveResourceLike('AWS::Events::Rule', {
      Targets: [
        {
          InputTransformer: {
            InputTemplate: stringLike('*url-2*'),
          },
        },
      ],
    });
  });
});