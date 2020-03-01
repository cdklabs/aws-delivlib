import { codePipeline, handler, logger } from "../lib/pipeline-watcher/watcher-handler";

codePipeline.getPipelineState = jest.fn();

test('handler should propagate error if GetPipelineState fails', async () => {
  process.env.PIPELINE_NAME = 'name';
  expect.assertions(2);
  codePipeline.getPipelineState = jest.fn(request => {
    expect(request).toEqual({ name: 'name' });
    return {
      promise: () => new Promise((_, reject) => reject(new Error('fail')))
    };
  }) as any;
  try {
    await handler();
  } catch (err) {
    expect(err.message).toEqual('fail');
  }
});

test('handler should throw error if process.env.PIPELINE_NAME is undefined', async () => {
  delete process.env.PIPELINE_NAME;
  expect.assertions(1);
  try {
    await handler();
  } catch (err) {
    expect(err.message).toEqual("Pipeline name expects environment variable: 'PIPELINE_NAME'");
  }
});

// prepare log with a new mock, set the name env variable and mock the getPipelineState fn.
function mock(response: any) {
  logger.log = jest.fn();
  process.env.PIPELINE_NAME = 'name';
  codePipeline.getPipelineState = jest.fn(request => {
    expect(request && request.name).toEqual(process.env.PIPELINE_NAME);
    return {
      promise: () => new Promise((resolve) => resolve(response))
    };
  }) as any;
}

test('handler should log {failCount: 0} if pipeline.stageStates is undefined', async () => {
  mock({});
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 0}));
});

test('handler should log {failCount: 0} if pipeline.stageStates is empty', async () => {
  mock({ stageStates: [] });
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 0}));
});

test('handler should log {failCount: 0} if pipeline.stageStates[:0].latestExecution are undefined', async () => {
  mock({ stageStates: [{
    latestExecution: undefined
  }] });
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 0}));
});

test('handler should log {failCount: 0} if none of pipeline.stageStates[:0].latestExecution.status are Failed', async () => {
  mock({ stageStates: [{
    latestExecution: {
      status: 'Success'
    }
  }] });
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 0}));
});

test('handler should log {failCount: 1} if one of pipeline.stageStates[:0].latestExecution.status is Failed', async () => {
  mock({ stageStates: [{
    latestExecution: {
      status: 'Failed'
    }
  }] });
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 1}));
});

test('handler should log {failCount: 2} for 2 "Failed" and 1 "Success" pipeline.stageStates[:0].latestExecution.status values', async () => {
  mock({
    stageStates: [{
      latestExecution: {
        status: 'Failed'
      }
    }, {
      latestExecution: {
        status: 'Sucess'
      }
    }, {
      latestExecution: {
        status: 'Failed'
      }
    }]
  });
  await handler();
  expect(logger.log).toBeCalledTimes(1);
  expect(logger.log).toBeCalledWith(JSON.stringify({failedCount: 2}));
});
