import { expect as cdk_expect, haveResource } from '@aws-cdk/assert';
import codebuild = require('@aws-cdk/aws-codebuild');
import codecommit = require('@aws-cdk/aws-codecommit');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import delivlib = require('../lib');

test('pipelineName can be used to set a physical name for the pipeline', async () => {
  const stack = new cdk.Stack();

  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline'
  });

  cdk_expect(stack).to(haveResource('AWS::CodePipeline::Pipeline', {
    Name: 'HelloPipeline'
  }));
});

test('concurrency: enabled by default', async () => {
  const stack = new cdk.Stack();

  createTestPipeline(stack);

  const template = stack.toCloudFormation();

  expect(template.Resources.PipelineBuildPipeline04C6628A.Properties.Stages.length).toBe(4);
});

test('concurrency: when disabled, we get a stage for each action', async () => {
  const stack = new cdk.Stack();
  createTestPipeline(stack, { concurrency: false } as any);
  const template = stack.toCloudFormation();
  expect(template.Resources.PipelineBuildPipeline04C6628A.Properties.Stages.length).toBe(7);
});

function createTestPipeline(stack: cdk.Stack, props?: delivlib.PipelineProps) {
  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    ...props
  });

  const project = new codebuild.Project(stack, 'publish', {
    buildSpec: { version: '0.2' }
  });

  const testDirectory = path.join(__dirname, 'delivlib-tests', 'linux');
  pipeline.addTest('test1', { testDirectory, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test2', { testDirectory, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addPublish({ id: 'pub1', project });
  pipeline.addPublish({ id: 'pub2', project });
  pipeline.addPublish({ id: 'pub3', project });

  return pipeline;
}

function createTestRepo(stack: cdk.Stack) {
  return new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' }));
}