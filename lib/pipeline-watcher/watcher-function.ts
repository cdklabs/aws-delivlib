import AWS = require('aws-sdk');

const pipeline = new AWS.CodePipeline();

/**
 * Lambda function for checking the stages of a CodePipeline and emitting log
 * entries with { failedCount = <no. of failed stages> } for async metric
 * aggregation via metric filters.
 *
 * It requires the pipeline's name be set as the 'PIPELINE_NAME' environment variable.
 */
export async function handler() {
  const pipelineName = process.env.PIPELINE_NAME;
  if (!pipelineName) {
    throw new Error("Pipeline name expects environment variable: 'PIPELINE_NAME'");
  }

  const state = await pipeline.getPipelineState({
    name: pipelineName
  }).promise();

  let failedCount = 0;
  if (state.stageStates) {
    failedCount = state.stageStates
      .filter(stage => stage.latestExecution !== undefined && stage.latestExecution.status === 'Failed')
      .length;
  }
  process.stdout.write(JSON.stringify({failedCount}));
}
