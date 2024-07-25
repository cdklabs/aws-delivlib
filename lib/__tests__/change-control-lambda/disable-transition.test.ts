// eslint-disable-next-line @typescript-eslint/no-require-imports


const pipelineName = 'MyPipeline';
const stageName = 'MyStage';

const mockCodePipelineClient = {
  disableStageTransition: jest.fn().mockName('CodePipeline.disableStageTransition'),
  enableStageTransition: jest.fn().mockName('CodePipeline.enableStageTransition'),

};

jest.mock('@aws-sdk/client-codepipeline', () => {
  return {
    CodePipeline: jest.fn().mockImplementation(() => {
      return mockCodePipelineClient;
    }),
  };
});

beforeEach(() => {
  mockCodePipelineClient.disableStageTransition.mockImplementation(() => Promise.resolve({}));
  mockCodePipelineClient.enableStageTransition.mockImplementation(() => Promise.resolve({}));
});

describe('disableTransition', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const disableTransition = require('../../change-control-lambda/disable-transition').disableTransition;

  test('with a simple reason', async () => {
    // GIVEN
    const reason = 'Just Because';
    // WHEN
    await expect(disableTransition(pipelineName, stageName, reason))
      .resolves.toBeUndefined();
    // THEN
    expect(mockCodePipelineClient.disableStageTransition)
      .toHaveBeenCalledWith({ pipelineName, stageName, reason, transitionType: 'Inbound' });
  });

  test('with a reason that needs cleaning up', async () => {
    // GIVEN
    const reason = 'It\'s so cool!';
    // WHEN
    await expect(disableTransition(pipelineName, stageName, reason))
      .resolves.toBeUndefined();
    // THEN
    const cleanReason = reason.replace(/[^a-zA-Z0-9!@ \(\)\.\*\?\-]/g, '-');
    expect(mockCodePipelineClient.disableStageTransition)
      .toHaveBeenCalledWith({ pipelineName, stageName, reason: cleanReason, transitionType: 'Inbound' });
  });

  test('with a reason that is too long', async () => {
    // GIVEN
    const reason = 'Reason '.repeat(300);
    // WHEN
    await expect(disableTransition(pipelineName, stageName, reason))
      .resolves.toBeUndefined();
    // THEN
    const cleanReason = reason.slice(0, 300);
    expect(mockCodePipelineClient.disableStageTransition)
      .toHaveBeenCalledWith({ pipelineName, stageName, reason: cleanReason, transitionType: 'Inbound' });
  });
});

test('enableTransition', async () => {
  // GIVEN
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const enableTransition = require('../../change-control-lambda/disable-transition').enableTransition;
  // WHEN
  expect(() => enableTransition(pipelineName, stageName))
    .not.toThrow();
  // THEN
  expect(mockCodePipelineClient.enableStageTransition)
    .toHaveBeenCalledWith({ pipelineName, stageName, transitionType: 'Inbound' });
});
