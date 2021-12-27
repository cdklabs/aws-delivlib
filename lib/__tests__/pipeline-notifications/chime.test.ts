import {
  App, Stack,
  aws_codecommit as codecommit,
} from 'aws-cdk-lib';
import { Capture, Template, Match } from 'aws-cdk-lib/assertions';
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

    const template = Template.fromStack(stack);
    const inputTemplateCapture = new Capture();

    // THEN
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.codepipeline'],
        resources: [
          stack.resolve(pipe.pipeline.pipelineArn),
        ],
      },
      Targets: Match.arrayWith([
        Match.objectLike({
          InputTransformer: {
            InputPathsMap: {
              detail: '$.detail',
            },
            InputTemplate: inputTemplateCapture,
          },
        }),
      ]),
    });

    expect(inputTemplateCapture.asString()).toContain('url-1');
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
    const template = Template.fromStack(stack);
    const inputTemplateCapture = new Capture();

    // THEN
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        'source': [
          'aws.codepipeline',
        ],
        'detail-type': [
          'CodePipeline Pipeline Execution State Change',
        ],
      },
      Targets: Match.arrayWith([
        Match.objectLike({
          InputTransformer: {
            InputPathsMap: {
              detail: '$.detail',
            },
            InputTemplate: inputTemplateCapture,
          },
        }),
      ]),
    });
    expect(inputTemplateCapture.asString()).toContain('url-1');
    inputTemplateCapture.next();
    expect(inputTemplateCapture.asString()).toContain('url-2');
  });
});
