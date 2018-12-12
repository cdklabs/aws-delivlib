import { expect, haveResource } from '@aws-cdk/assert';
import codecommit = require('@aws-cdk/aws-codecommit');
import cdk = require('@aws-cdk/cdk');
import delivlib = require('../lib');

test('pipelineName can be used to set a physical name for the pipeline', async () => {
  const stack = new cdk.Stack();

  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' })),
    pipelineName: 'HelloPipeline'
  });

  expect(stack).to(haveResource('AWS::CodePipeline::Pipeline', {
    Name: 'HelloPipeline'
  }));
});
