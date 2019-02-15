import AWS = require('aws-sdk');
const pipeline = new AWS.CodePipeline();

/**
 * Disables a CodePipeline transition into a given stage.
 * @param pipelineName the name of the pipeline on which a transition will be disabled.
 * @param stageName    the name of the stage into which a transition will be disabled.
 * @param reason       the reason to tag on the disabled transition
 */
export async function disableTransition(pipelineName: string, stageName: string, reason: string): Promise<void> {
  // Make sure the reason contains no illegal characters!
  reason = reason.replace(/[^a-zA-Z0-9!@ \(\)\.\*\?\-]/g, '-');
  await pipeline.disableStageTransition({
    pipelineName,
    reason,
    stageName,
    transitionType: 'Inbound'
  }).promise();
}

/**
 * Enables a CodePipeline transition into a given stage.
 * @param pipelineName the name of the pipeline on which a transition will be enabled.
 * @param stageName    the name of the stage into which a transition will be enabled.
 */
export async function enableTransition(pipelineName: string, stageName: string): Promise<void> {
  await pipeline.enableStageTransition({
    pipelineName,
    stageName,
    transitionType: 'Inbound'
  }).promise();
}
