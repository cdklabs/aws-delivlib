import * as https from 'https';
import {
  App, Construct, Stack,
  aws_codepipeline as aws_codepipeline,
  aws_codepipeline_actions as aws_codepipeline_actions,
} from 'monocdk';
import { ChimeNotifier } from '../lib';
import { codePipeline, handler } from '../lib/chime-notifier/notifier-handler';
import '@monocdk-experiment/assert/jest';

jest.mock('https');

const mockHttpsWrite = jest.fn();
(https as any).request = jest.fn((_url, _options, cb) => {
  return {
    on: jest.fn(),
    write: mockHttpsWrite,
    end: () => cb({
      statusCode: 200,
      headers: {},
      setEncoding: () => undefined,
      on: (event: string, listener: () => void) => {
        if (event === 'end') { listener(); }
      },
    }),
  };
});

test('call codepipeline and then post to webhooks', async () => {
  codePipeline.getPipelineExecution = jest.fn().mockReturnValue({
    promise: () => Promise.resolve({
      pipelineExecution: {
        pipelineExecutionId: 'xyz',
        pipelineVersion: 1,
        pipelineName: 'xyz',
        status: 'Succeeded',
        artifactRevisions: [
          {
            revisionUrl: 'revision.com/url',
            revisionId: '1234',
            name: 'Source',
            revisionSummary: 'A thing happened',
          },
        ],
      },
    }),
  });

  codePipeline.listActionExecutions = jest.fn().mockReturnValue({
    promise: () => Promise.resolve({
      actionExecutionDetails: [
        {
          stageName: 'Source',
          actionName: 'Source',
          status: 'Succeeded',
          output: {
            executionResult: {
              externalExecutionUrl: 'https://SUCCEED',
            },
          },
        },
        {
          stageName: 'Build',
          actionName: 'Build',
          status: 'Failed',
          output: {
            executionResult: {
              externalExecutionUrl: 'https://FAIL',
            },
          },
        },
      ],
    }),
  });

  await handler({
    webhookUrls: ['https://my.url/'],
    message: "Pipeline '$PIPELINE' failed on '$REVISION' in '$ACTION' (see $URL)",
    detail: {
      'pipeline': 'myPipeline',
      'version': '1',
      'state': 'FAILED',
      'execution-id': 'abcdef',
    },
  });

  expect(https.request).toBeCalledWith('https://my.url/', expect.objectContaining({
    method: 'POST',
  }), expect.any(Function));
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('"Content"')); // Contains JSON

  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('myPipeline')); // Contains the pipeline name
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('A thing happened')); // Contains the revision summary
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('Build')); // Contains the failing action name
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('https://FAIL')); // Contains the failing URL
});

test('can add to stack', () => {
  const stack = new Stack(new App(), 'TestStack');
  const pipeline = new aws_codepipeline.Pipeline(stack, 'Pipe');
  pipeline.addStage({ stageName: 'Source', actions: [new FakeSourceAction()] });
  pipeline.addStage({ stageName: 'Build', actions: [new aws_codepipeline_actions.ManualApprovalAction({ actionName: 'Dummy' })] });

  new ChimeNotifier(stack, 'Chime', {
    pipeline,
    webhookUrls: ['https://go/'],
  });

  // EXPECT: no error
  expect(stack).toHaveResource('AWS::Lambda::Function');
});

export class FakeSourceAction extends aws_codepipeline_actions.Action {
  constructor() {
    super({
      actionName: 'Fake',
      category: aws_codepipeline.ActionCategory.SOURCE,
      provider: 'FAKE',
      artifactBounds: {
        minInputs: 0,
        maxInputs: 0,
        minOutputs: 1,
        maxOutputs: 1,
      },
      outputs: [new aws_codepipeline.Artifact('bla')],
    });
  }

  // tslint:disable-next-line: max-line-length
  protected bound(_scope: Construct, _stage: aws_codepipeline.IStage, _options: aws_codepipeline.ActionBindOptions): aws_codepipeline.ActionConfig {
    return {
      configuration: { },
    };
  }
}
