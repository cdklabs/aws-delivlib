import * as AWS from 'aws-sdk';


// export for tests
export const codePipeline = new AWS.CodePipeline();
export const logger = {
  log: (line: string) => process.stdout.write(line),
};

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
  const state = await codePipeline.getPipelineState({
    name: pipelineName,
  }).promise();

  let failedCount = 0;
  if (state.stageStates) {
    failedCount = state.stageStates
      .filter(stage => stage.latestExecution !== undefined && stage.latestExecution.status === 'Failed')
      .length;
  }
  logger.log(JSON.stringify({
    failedCount,
  }));
}
