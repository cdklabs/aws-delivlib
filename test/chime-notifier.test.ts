import * as https from 'https';
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
      }
    })
  };
});

import { codePipeline, handler } from '../lib/chime-notifier/notifier-handler';

test('call codepipeline and then post to webhooks', async () => {
  process.env.WEBHOOK_URLS = 'https://my.url/';
  process.env.MESSAGE = "Pipeline '$PIPELINE' failed on '$REVISION' in '$ACTION' (see $URL)";

  codePipeline.getPipelineExecution = jest.fn().mockReturnValue({
    promise: () => Promise.resolve({
      "pipelineExecution": {
        "pipelineExecutionId": "xyz",
        "pipelineVersion": 1,
        "pipelineName": "xyz",
        "status": "Succeeded",
        "artifactRevisions": [
          {
            "revisionUrl": "revision.com/url",
            "revisionId": "1234",
            "name": "Source",
            "revisionSummary": "A thing happened"
          }
        ]
      }
    })
  });

  codePipeline.listActionExecutions = jest.fn().mockReturnValue({
    promise: () => Promise.resolve({
      "actionExecutionDetails": [
        {
          "stageName": "Source",
          "actionName": "Source",
          "status": "Succeeded",
          "output": {
            "executionResult": {
              "externalExecutionUrl": "https://SUCCEED"
            },
          }
        },
        {
          "stageName": "Build",
          "actionName": "Build",
          "status": "Failed",
          "output": {
            "executionResult": {
              "externalExecutionUrl": "https://FAIL"
            },
          }
        },
      ]
    })
  });

  await handler({
    "detail": {
        "pipeline": "myPipeline",
        "version": "1",
        "state": "FAILED",
        "execution-id": "abcdef"
    }
  });

  expect(https.request).toBeCalledWith('https://my.url/', expect.objectContaining({
    method: 'POST'
  }), expect.any(Function));
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('"Content"')); // Contains JSON

  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('myPipeline')); // Contains the pipeline name
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('A thing happened')); // Contains the revision summary
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('Build')); // Contains the failing action name
  expect(mockHttpsWrite).toBeCalledWith(expect.stringContaining('https://FAIL')); // Contains the failing URL
});