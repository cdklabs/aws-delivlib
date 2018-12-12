import AWS = require('aws-sdk');

const pipeline = new AWS.CodePipeline();

/**
 * Lambda function for checking the stages of a CodePipeline and emitting log
 * entries with { failedCount = <no. of failed stages> } for async metric
 * aggregation via metric filters.
 *
 * It requires the pipeline's name be set as the 'pipelineName' environment variable.
 */
export async function handler() {
  const pipelineName = process.env.pipelineName;
  if (!pipelineName) {
    throw new Error("Pipeline name expects environment variable: 'pipelineName'");
  }

  const state = await pipeline.getPipelineState({
    name: pipelineName
  }).promise();

  if (state.stageStates) {
    const failedCount = state.stageStates
      .filter(stage => stage.latestExecution !== undefined && stage.latestExecution.status === 'Failed')
      .length;

    process.stdout.write(JSON.stringify({failedCount}));
  }
}