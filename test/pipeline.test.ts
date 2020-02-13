import { aws_codebuild as codebuild, aws_codecommit as codecommit, aws_codepipeline as cpipeline, aws_codepipeline_actions as cpipeline_actions, core as cdk } from "monocdk-experiment";
import { expect as cdk_expect, haveResource, haveResourceLike, SynthUtils } from "@aws-cdk/assert";
import path = require("path");
import delivlib = require("../lib");
import { AddToPipelineOptions, IPublisher } from "../lib";
import { determineRunOrder } from "../lib/util";


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

  const template = SynthUtils.synthesize(stack).template;
  return template.Resources.PipelineBuildPipeline04C6628A.Properties.Stages;
}

function createTestRepo(stack: cdk.Stack) {
  return new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' }));
}

class TestPublishable extends cdk.Construct implements delivlib.IPublisher {
  public readonly project: codebuild.IProject;

  constructor(scope: cdk.Construct, id: string, props: { project: codebuild.IProject }) {
    super(scope, id);

    this.project = props.project;
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      project: this.project,
      runOrder: options.runOrder,
    }));
  }
}

test('can add arbitrary shellables with different artifacts', () => {
  const stack = new cdk.Stack();

  const pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline'
  });

  const action = pipeline.addShellable('Build', 'SecondStep', {
    scriptDirectory: __dirname,
    entrypoint: 'run-test.sh',
  });

  pipeline.addPublish(new Pub(stack, 'Pub'), { inputArtifact: action.actionProperties.outputs![0] });

  cdk_expect(stack).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
    Stages: [
      {
        Name: "Source",
        Actions: [
          {
            ActionTypeId: { Category: "Source", Owner: "AWS", Provider: "CodeCommit" },
            Name: "Pull",
            OutputArtifacts: [
              {
                Name: "Source"
              }
            ],
          }
        ],
      },
      {
        Name: "Build",
        Actions: [
          {
            Name: "Build",
            ActionTypeId: { Category: "Build", Owner: "AWS", Provider: "CodeBuild" },
            InputArtifacts: [ { Name: "Source" } ],
            OutputArtifacts: [ { Name: "Artifact_Build_Build" } ],
            RunOrder: 1
          },
          {
            ActionTypeId: { Category: "Build", Owner: "AWS", Provider: "CodeBuild", },
            InputArtifacts: [ { Name: "Artifact_Build_Build" } ],
            Name: "ActionSecondStep",
            OutputArtifacts: [ { Name: "Artifact_PipelineSecondStepD5683DEB" } ],
            RunOrder: 1
          }
        ],
      },
      {
        Name: "Publish",
        Actions: [
          {
            ActionTypeId: { Category: "Build", Owner: "AWS", Provider: "CodeBuild", },
            InputArtifacts: [ { Name: "Artifact_PipelineSecondStepD5683DEB" } ],
            Name: "PubPublish",
            RunOrder: 1
          }
        ],
      }
    ],
  }));
});

test('autoBuild() can be used to add automatic builds to the pipeline', () => {
  // GIVEN
  const stack = new cdk.Stack();

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true
  });

  cdk_expect(stack).notTo(haveResource('AWS::Serverless::Application', {
    Location: {
      ApplicationId: "arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs",
      SemanticVersion: "1.3.0"
    }
  }));
});

test('autoBuild() can be configured to publish logs publically', () => {
  // GIVEN
  const stack = new cdk.Stack();

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true,
    autoBuildOptions: {
      publicLogs: true
    }
  });

  cdk_expect(stack).to(haveResource('AWS::Serverless::Application', {
    Location: {
      ApplicationId: "arn:aws:serverlessrepo:us-east-1:277187709615:applications/github-codebuild-logs",
      SemanticVersion: "1.3.0"
    }
  }));
});

test('autoBuild() can be configured with a different buildspec', () => {
  // GIVEN
  const stack = new cdk.Stack();

  // WHEN
  new delivlib.Pipeline(stack, 'Pipeline', {
    repo: createTestRepo(stack),
    pipelineName: 'HelloPipeline',
    autoBuild: true,
    autoBuildOptions: {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('different-buildspec.yaml'),
    },
  });

  // THEN
  cdk_expect(stack).to(haveResource('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: "different-buildspec.yaml",
      Location: {
        "Fn::GetAtt": [
          "Repo02AC86CF",
          "CloneUrlHttp"
        ]
      },
      Type: "CODECOMMIT",
    }
  }));
});

class Pub extends cdk.Construct implements IPublisher {
  public readonly project: codebuild.IProject;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    this.project = new codebuild.PipelineProject(this, 'Project');
  }

  public addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void {
    stage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new cpipeline.Artifact(),
      project: this.project,
      runOrder: options.runOrder,
    }));
  }
}
