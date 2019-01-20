import { expect as cdk_expect, haveResource } from '@aws-cdk/assert';
import codebuild = require('@aws-cdk/aws-codebuild');
import codecommit = require('@aws-cdk/aws-codecommit');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import delivlib = require('../lib');
import { determineRunOrder } from '../lib/util';

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

test('concurrency: unlimited by default', async () => {
  const stack = new cdk.Stack();

  const stages = createTestPipelineForConcurrencyTests(stack);

  // default is RunOrder = 1 for all actions which means they all run in parallel
  for (const stage of stages) {
    const actions = stage.Actions;
    for (const action of actions) {
      expect(action.RunOrder).toBe(1);
    }
  }
});

test('concurrency = 1: means that actions will run sequentially', async () => {
  const stack = new cdk.Stack();
  const stages = createTestPipelineForConcurrencyTests(stack, { concurrency: 1 } as any);

  for (const stage of stages) {
    const actions = stage.Actions;
    let expected = 1;
    for (const action of actions) {
      expect(action.RunOrder).toBe(expected);
      expected++;
    }
  }
});

test('determineRunOrder: creates groups of up to "concurrency" actions', async () => {
  testCase({ actionCount: 1,  concurrency: 1 });
  testCase({ actionCount: 10, concurrency: 1 });
  testCase({ actionCount: 56, concurrency: 4 });
  testCase({ actionCount: 3,  concurrency: 2 });

  function testCase({ actionCount, concurrency }: { actionCount: number, concurrency: number }) {
    const actionsPerRunOrder: { [runOrder: number]: number } = { };
    for (let i = 0; i < actionCount; ++i) {
      const runOrder = determineRunOrder(i, concurrency)!;
      if (!actionsPerRunOrder[runOrder]) {
        actionsPerRunOrder[runOrder] = 0;
      }
      actionsPerRunOrder[runOrder]++;
    }

    // assert that there are no more than *concurrency* actions in each runOrder
    let total = 0;
    for (const [ , count ] of Object.entries(actionsPerRunOrder)) {
      expect(count).toBeLessThanOrEqual(concurrency);
      total += count;
    }

    expect(total).toBe(actionCount); // sanity
  }
});

function createTestPipelineForConcurrencyTests(stack: cdk.Stack, props?: delivlib.PipelineProps) {
  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    ...props
  });

  const project = new codebuild.Project(stack, 'publish', {
    buildSpec: { version: '0.2' }
  });

  const scriptDirectory = path.join(__dirname, 'delivlib-tests', 'linux');
  const entrypoint = 'test.sh';
  pipeline.addTest('test1', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test2', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test3', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test4', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test5', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addPublish({ id: 'pub1', project });
  pipeline.addPublish({ id: 'pub2', project });
  pipeline.addPublish({ id: 'pub3', project });
  pipeline.addPublish({ id: 'pub4', project });
  pipeline.addPublish({ id: 'pub5', project });
  pipeline.addPublish({ id: 'pub6', project });

  const template = stack.toCloudFormation();
  return template.Resources.PipelineBuildPipeline04C6628A.Properties.Stages;
}

function createTestRepo(stack: cdk.Stack) {
  return new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' }));
}