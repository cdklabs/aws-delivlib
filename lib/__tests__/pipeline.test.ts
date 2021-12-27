import * as path from 'path';
import {
  App, Duration, Stack,
  aws_codebuild as codebuild,
  aws_codecommit as codecommit,
  aws_codepipeline as cpipeline,
  aws_codepipeline_actions as cpipeline_actions,
} from 'aws-cdk-lib';
import { Capture, Template, Match } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import * as delivlib from '../../lib';
import { determineRunOrder } from '../../lib/util';

test('pipelineName can be used to set a physical name for the pipeline', async () => {
  const stack = new Stack(new App(), 'TestStack');

  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
    Name: 'HelloPipeline',
  });
});

test('concurrency: unlimited by default', async () => {
  const stack = new Stack(new App(), 'TestStack');

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
  const stack = new Stack(new App(), 'TestStack');
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
  testCase({ actionCount: 1, concurrency: 1 });
  testCase({ actionCount: 10, concurrency: 1 });
  testCase({ actionCount: 56, concurrency: 4 });
  testCase({ actionCount: 3, concurrency: 2 });

  function testCase({ actionCount, concurrency }: { actionCount: number; concurrency: number }) {
    const actionsPerRunOrder: { [runOrder: number]: number } = {};
    for (let i = 0; i < actionCount; ++i) {
      const runOrder = determineRunOrder(i, concurrency)!;
      if (!actionsPerRunOrder[runOrder]) {
        actionsPerRunOrder[runOrder] = 0;
      }
      actionsPerRunOrder[runOrder]++;
    }

    // assert that there are no more than *concurrency* actions in each runOrder
    let total = 0;
    for (const [, count] of Object.entries(actionsPerRunOrder)) {
      expect(count).toBeLessThanOrEqual(concurrency);
      total += count;
    }

    expect(total).toBe(actionCount); // sanity
  }
});

test('can add arbitrary shellables with different artifacts', () => {
  const stack = new Stack(new App(), 'TestStack');

  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
  });

  const action = pipeline.addShellable('Test', 'SecondStep', {
    scriptDirectory: __dirname,
    entrypoint: 'run-test.sh',
  }).action;

  pipeline.addPublish(new Pub(stack, 'Pub'), { inputArtifact: action.actionProperties.outputs![0] });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
    Stages: Match.arrayWith([
      {
        Actions: [
          Match.objectLike({
            ActionTypeId: { Category: 'Source', Owner: 'AWS', Provider: 'CodeCommit', Version: '1' },
            Name: 'Pull',
            OutputArtifacts: [
              {
                Name: 'Source',
              },
            ],
          }),
        ],
        Name: 'Source',
      },
      {
        Actions: [
          Match.objectLike({
            Name: 'Build',
            ActionTypeId: { Category: 'Build', Owner: 'AWS', Provider: 'CodeBuild', Version: '1' },
            InputArtifacts: [{ Name: 'Source' }],
            OutputArtifacts: [{ Name: 'Artifact_Build_Build' }],
            RunOrder: 1,
          }),
        ],
        Name: 'Build',
      },
      {
        Actions: [
          Match.objectLike({
            ActionTypeId: { Category: 'Build', Owner: 'AWS', Provider: 'CodeBuild', Version: '1' },
            InputArtifacts: [{ Name: 'Artifact_Build_Build' }],
            Name: 'ActionSecondStep',
            OutputArtifacts: [{ Name: 'Artifact_c81eddcbe9657bd312a728fb13df77bc09f9a519b4' }],
            RunOrder: 1,
          }),
        ],
        Name: 'Test',
      },
      {
        Actions: [
          Match.objectLike({
            ActionTypeId: { Category: 'Build', Owner: 'AWS', Provider: 'CodeBuild', Version: '1' },
            InputArtifacts: [{ Name: 'Artifact_c81eddcbe9657bd312a728fb13df77bc09f9a519b4' }],
            Name: 'PubPublish',
            RunOrder: 1,
          }),
        ],
        Name: 'Publish',
      },
    ]),
  });
});

test('autoBuild() can be used to add automatic builds to the pipeline', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true,
  });
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Serverless::Application', 0);
});

test('autoBuild() can be configured to publish logs publically', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true,
    autoBuildOptions: {
      publicLogs: true,
    },
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Serverless::Application', {
    Location: {
      ApplicationId: 'arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs',
      SemanticVersion: '1.4.0',
    },
    Parameters: {
      CodeBuildProjectName: {
        Ref: 'PipelineAutoBuildProjectB97B4446',
      },
      DeletePreviousComments: 'true',
      CommentOnSuccess: 'true',
    },
  });
});

test('autoBuild() can be configured with a different buildspec', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true,
    autoBuildOptions: {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('different-buildspec.yaml'),
    },
  });

  const template = Template.fromStack(stack);
  // THEN
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: 'different-buildspec.yaml',
      Location: {
        'Fn::GetAtt': [
          'Repo02AC86CF',
          'CloneUrlHttp',
        ],
      },
      Type: 'CODECOMMIT',
    },
  });
});

test('CodeBuild Project name matches buildProjectName property', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    buildProjectName: 'HelloBuild',
  });

  const template = Template.fromStack(stack);
  // THEN
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Name: 'HelloBuild',
  });
});

test('CodeBuild Project name is extended from pipelineName property', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
  });

  // THEN
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Name: 'HelloPipeline-Build',
  });
});

test('CodeBuild Project name is left undefined when neither buildProjectName nor pipelineName are specified', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
  });
  const template = Template.fromStack(stack);

  // THEN
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Name: Match.absent(),
  });
});

test('metricFailures', () => {
  const stack = new Stack(new App(), 'TestStack');
  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
  });

  expect(stack.resolve(pipeline.metricFailures({}))).toEqual({
    dimensions: { Pipeline: { Ref: 'PipelineBuildPipeline04C6628A' } },
    namespace: 'CDK/Delivlib',
    metricName: 'Failures',
    period: Duration.minutes(5),
    statistic: 'Sum',
  });
});

test('metricActionFailures', () => {
  const stack = new Stack(new App(), 'TestStack');
  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
  });
  const project = new codebuild.Project(stack, 'publish', {
    buildSpec: codebuild.BuildSpec.fromObject({ version: '0.2' }),
  });
  const scriptDirectory = __dirname;
  const entrypoint = 'run-test.sh';

  pipeline.addShellable('PreBuild', 'FirstStep', { scriptDirectory, entrypoint });
  pipeline.addShellable('PreBuild', 'SecondStep', { scriptDirectory, entrypoint });
  pipeline.addPublish(new TestPublishable(stack, 'Publish1', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'Publish2', { project }));
  pipeline.addTest('Test1', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('Test2', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });

  const expectedMetricNames = [
    'Pull',
    'Build',
    'ActionFirstStep',
    'ActionSecondStep',
    'Publish1Publish',
    'Publish2Publish',
    'TestTest1',
    'TestTest2',
  ];
  const expectedMetrics = expectedMetricNames.map(name => {
    return {
      dimensions: { Pipeline: { Ref: 'PipelineBuildPipeline04C6628A' }, Action: name },
      namespace: 'CDK/Delivlib',
      metricName: 'Failures',
      period: Duration.minutes(5),
      statistic: 'Sum',
    };
  });

  expect(stack.resolve(pipeline.metricActionFailures({}))).toEqual(expectedMetrics);
});

function createTestPipelineForConcurrencyTests(stack: Stack, props?: delivlib.PipelineProps) {
  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    ...props,
  });

  const project = new codebuild.Project(stack, 'publish', {
    buildSpec: codebuild.BuildSpec.fromObject({ version: '0.2' }),
  });

  const scriptDirectory = path.join(__dirname, 'delivlib-tests', 'linux');
  const entrypoint = 'test.sh';
  pipeline.addTest('test1', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test2', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test3', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test4', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addTest('test5', { scriptDirectory, entrypoint, platform: delivlib.ShellPlatform.LinuxUbuntu });
  pipeline.addPublish(new TestPublishable(stack, 'pub1', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'pub2', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'pub3', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'pub4', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'pub5', { project }));
  pipeline.addPublish(new TestPublishable(stack, 'pub6', { project }));

  const template = Template.fromStack(stack);
  const capture = new Capture();
  template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
    Stages: capture,
  });
  return capture.asArray();
}

function createTestRepo(stack: Stack) {
  return new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' }));
}

class TestPublishable extends Construct implements delivlib.IPublisher {
  public readonly project: codebuild.IProject;

  constructor(scope: Construct, id: string, props: { project: codebuild.IProject }) {
    super(scope, id);

    this.project = props.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: delivlib.AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      project: this.project,
      runOrder: options.runOrder,
    }));
  }
}

class Pub extends Construct implements delivlib.IPublisher {
  public readonly project: codebuild.IProject;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.project = new codebuild.PipelineProject(this, 'Project');
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: delivlib.AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      project: this.project,
      runOrder: options.runOrder,
    }));
  }
}

