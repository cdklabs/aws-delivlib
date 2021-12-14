// eslint-disable-next-line @typescript-eslint/no-require-imports
import AWS = require('aws-sdk');

const mockDisableStageTransition = jest.fn((_params: AWS.CodePipeline.DisableStageTransitionInput) => {
  return { promise: () => Promise.resolve({}) };
}).mockName('AWS.CodePipeline.disableStageTransition');

const mockEnableStageTransition = jest.fn((_params: AWS.CodePipeline.EnableStageTransitionInput) => {
  return { promise: () => Promise.resolve({}) };
}).mockName('AWS.CodePipeline.enableStageTransition');

const pipelineName = 'MyPipeline';
const stageName = 'MyStage';

(AWS as any).CodePipeline = jest.fn(() => ({
  disableStageTransition: mockDisableStageTransition,
  enableStageTransition: mockEnableStageTransition,
}) as unknown as AWS.CodePipeline).mockName('AWS.CodePipeline') as any;

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
    expect(mockDisableStageTransition)
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
    expect(mockDisableStageTransition)
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
    expect(mockDisableStageTransition)
      .toHaveBeenCalledWith({ pipelineName, stageName, reason: cleanReason, transitionType: 'Inbound' });
  });
});

test('enableTransition', async () => {
  // GIVEN
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const enableTransition = require('../../change-control-lambda/disable-transition').enableTransition;
  // WHEN
  await expect(() => enableTransition(pipelineName, stageName))
    .not.toThrow();
  // THEN
  expect(mockEnableStageTransition)
    .toHaveBeenCalledWith({ pipelineName, stageName, transitionType: 'Inbound' });
});
