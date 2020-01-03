import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import { BuildEnvironment } from '@aws-cdk/aws-codebuild';
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import events = require('@aws-cdk/aws-events');
import events_targets = require('@aws-cdk/aws-events-targets');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import sns = require('@aws-cdk/aws-sns');
import sns_subs = require('@aws-cdk/aws-sns-subscriptions');
import cdk = require('@aws-cdk/core');
import { AutoBuild, AutoBuildOptions } from './auto-build';
import { createBuildEnvironment } from './build-env';
import { AutoBump, AutoBumpOptions } from './bump';
import { Canary, CanaryProps } from './canary';
import { ChangeController } from './change-controller';
import { PipelineWatcher } from './pipeline-watcher';
import publishing = require('./publishing');
import { IRepo, WritableGitHubRepo } from './repo';
import { Shellable, ShellableProps } from './shellable';
import { determineRunOrder } from './util';

const PUBLISH_STAGE_NAME = 'Publish';
const TEST_STAGE_NAME = 'Test';

export interface PipelineProps {
  /**
   * The source repository to build (e.g. GitHubRepo).
   */
  repo: IRepo;

  /**
   * A display name for this pipeline.
   */
  title?: string;

  /**
   * A physical name for this pipeline.
   * @default a new name will be generated.
   */
  pipelineName?: string;

  /**
   * Branch to build.
   * @default master
   */
  branch?: string;

  /**
   * Email to send failure notifications.
   * @default No email notifications
   */
  notificationEmail?: string;

  /**
   * The image used for the builds.
   *
   * @default jsii/superchain (see docs)
   */
  buildImage?: cbuild.IBuildImage;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default taken from {@link #buildImage#defaultComputeType}
   */
  computeType?: cbuild.ComputeType;

  /**
   * Indicates how the project builds Docker images. Specify true to enable
   * running the Docker daemon inside a Docker container. This value must be
   * set to true only if this build project will be used to build Docker
   * images, and the specified build environment image is not one provided by
   * AWS CodeBuild with Docker support. Otherwise, all associated builds that
   * attempt to interact with the Docker daemon will fail.
   *
   * @default false
   */
  privileged?: boolean;

  /**
   * Environment variables to pass to build
   */
  environment?: { [key: string]: string };

  /**
   * Optional buildspec, as an alternative to a buildspec.yml file
   */
  buildSpec?: cbuild.BuildSpec;

  /**
   * Indicates whether to re-run the pipeline after you've updated it.
   * @default true
   */
  restartExecutionOnUpdate?: boolean;

  /**
   * Indicates the concurrency limit test and publish stages.
   *
   * For example, if this value is 2, then only two actions will execute concurrently.
   * If this value is 1, the pipeline will not have any concurrent execution.
   *
   * @default no limit
   */
  concurrency?: number;

  /**
   * Set the default dryRun for all publishing steps
   *
   * (Can still be changed when adding a step).
   *
   * @default false
   */
  dryRun?: boolean;

  /**
   * Automatically build commits that are pushed to this repository, including PR builds on github.
   */
  autoBuild?: boolean;

  /**
   * Options for auto-build
   *
   * @default - 'autoBuildOptions.publicLogs' will be set to its default. 'autoBuildOptions.buildspec' will be configured to match with the
   * 'buildSpec' property.
   */
  autoBuildOptions?: AutoBuildOptions;
}

/**
 * Defines a delivlib CI/CD pipeline.
 */
export class Pipeline extends cdk.Construct {
  public buildRole?: iam.IRole;
  public readonly failureAlarm: cloudwatch.Alarm;
  public readonly buildOutput: cpipeline.Artifact;

  private readonly pipeline: cpipeline.Pipeline;
  private readonly branch: string;
  private readonly notify?: sns.Topic;
  private stages: { [name: string]: cpipeline.IStage } = { };

  private readonly concurrency?: number;
  private readonly repo: IRepo;
  private readonly dryRun: boolean;
  private readonly buildEnvironment: BuildEnvironment;
  private readonly buildSpec?: cbuild.BuildSpec;

  constructor(parent: cdk.Construct, name: string, props: PipelineProps) {
    super(parent, name);

    this.concurrency = props.concurrency;
    this.repo = props.repo;
    this.dryRun = !!props.dryRun;

    this.pipeline = new cpipeline.Pipeline(this, 'BuildPipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: props.restartExecutionOnUpdate === undefined ? true : props.restartExecutionOnUpdate
    });

    this.branch = props.branch || 'master';
    const sourceArtifact = props.repo.createSourceStage(this.pipeline, this.branch);

    this.buildEnvironment = createBuildEnvironment(props);
    this.buildSpec = props.buildSpec;

    const buildProject = new cbuild.PipelineProject(this, 'BuildProject', {
      environment: this.buildEnvironment,
      buildSpec: this.buildSpec,
    });

    this.buildRole = buildProject.role;

    const buildStage = this.getOrCreateStage('Build');
    const buildOutput = new cpipeline.Artifact();
    buildStage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: buildProject,
      input: sourceArtifact,
      outputs: [buildOutput],
    }));
    this.buildOutput = buildOutput;

    if (props.notificationEmail) {
      this.notify = new sns.Topic(this, 'NotificationsTopic');
      this.notify.addSubscription(new sns_subs.EmailSubscription(props.notificationEmail));
    }

    // add a failure alarm for the entire pipeline.
    this.failureAlarm = this.addFailureAlarm(props.title);

    // emit an SNS notification every time build fails.
    this.addBuildFailureNotification(buildProject, `${props.title} build failed`);

    if (props.autoBuild) {
      this.autoBuild(props.autoBuildOptions);
    }
  }

  /**
   * Add an action to run a shell script to the pipeline
   */
  public addShellable(stageName: string, id: string, options: AddShellableOptions): cpipeline_actions.CodeBuildAction {
    const stage = this.getOrCreateStage(stageName);

    const sh = new Shellable(this, id, options);
    const action = sh.addToPipeline(
        stage,
        options.actionName || `Action${id}`,
        options.inputArtifact || this.buildOutput,
        this.determineRunOrderForNewAction(stage));

    if (options.failureNotification) {
      this.addBuildFailureNotification(sh.project, options.failureNotification);
    }

    return action;
  }

  public addTest(id: string, props: ShellableProps): void {
    this.addShellable(TEST_STAGE_NAME, id, {
      actionName: `Test${id}`,
      failureNotification: `Test ${id} failed`,
      ...props
    });
  }

  /**
   * Convenience/discovery method that defines a canary test in your account.
   * @param id the construct id
   * @param props canary options
   */
  public addCanary(id: string, props: CanaryProps) {
    return new Canary(this, `Canary${id}`, props);
  }

  public addPublish(publisher: IPublisher, options: AddPublishOptions = {}) {
    const stage = this.getOrCreateStage(PUBLISH_STAGE_NAME);

    publisher.addToPipeline(stage, `${publisher.node.id}Publish`, {
      inputArtifact: options.inputArtifact || this.buildOutput,
      runOrder: this.determineRunOrderForNewAction(stage)
    });
  }

  /**
   * Adds a change control policy to block transitions into the publish stage during certain time windows.
   * @param options the options to configure the change control policy.
   */
  public addChangeControl(options: AddChangeControlOptions = { }): ChangeController {
    const publishStage = this.getStage(PUBLISH_STAGE_NAME);
    if (!publishStage) {
      throw new Error(`This pipeline does not have a ${PUBLISH_STAGE_NAME} stage yet. Add one first.`);
    }

    return new ChangeController(this, 'ChangeController', {
      ...options,
      pipelineStage: publishStage,
    });
  }

  public publishToNpm(options: publishing.PublishToNpmProjectProps) {
    this.addPublish(new publishing.PublishToNpmProject(this, 'Npm', {
      dryRun: this.dryRun,
      ...options
    }));
  }

  public publishToMaven(options: publishing.PublishToMavenProjectProps) {
    this.addPublish(new publishing.PublishToMavenProject(this, 'Maven', {
      dryRun: this.dryRun,
      ...options
    }));
  }

  public publishToNuGet(options: publishing.PublishToNuGetProjectProps) {
    this.addPublish(new publishing.PublishToNuGetProject(this, 'NuGet', {
      dryRun: this.dryRun,
      ...options
    }));
  }

  public publishToGitHubPages(options: publishing.PublishDocsToGitHubProjectProps) {
    this.addPublish(new publishing.PublishDocsToGitHubProject(this, 'GitHubPages', {
      dryRun: this.dryRun,
      ...options,
    }));
  }

  public publishToGitHub(options: publishing.PublishToGitHubProps) {
    this.addPublish(new publishing.PublishToGitHub(this, 'GitHub', {
      dryRun: this.dryRun,
      ...options
    }));
  }

  public publishToPyPI(options: publishing.PublishToPyPiProps) {
    this.addPublish(new publishing.PublishToPyPi(this, 'PyPI', {
      dryRun: this.dryRun,
      ...options
    }));
  }

  public publishToS3(id: string, options: publishing.PublishToS3Props & AddPublishOptions) {
    this.addPublish(new publishing.PublishToS3(this, id, {
      dryRun: this.dryRun,
      ...options
    }), options);
  }

  /**
   * Enables automatic bumps for the source repo.
   * @param options Options for auto bump (see AutoBumpOptions for description of defaults)
   */
  public autoBump(options?: AutoBumpOptions): AutoBump {
    if (!WritableGitHubRepo.isWritableGitHubRepo(this.repo)) {
      throw new Error(`"repo" must be a WritableGitHubRepo in order to enable auto-bump`);
    }

    return new AutoBump(this, 'AutoBump', {
      repo: this.repo,
      ...options
    });
  }

  /**
   * Enables automatic builds of pull requests in the Github repository and posts the
   * results back as a comment with a public link to the build logs.
   */
  public autoBuild(options: AutoBuildOptions = { }) {
    new AutoBuild(this, 'AutoBuild', {
      environment: this.buildEnvironment,
      repo: this.repo,
      buildSpec: options.buildSpec || this.buildSpec,
      ...options
    });
  }

  private addFailureAlarm(title?: string): cloudwatch.Alarm {
    return new PipelineWatcher(this, 'PipelineWatcher', {
      pipeline: this.pipeline,
      title
    }).alarm;
  }

  private addBuildFailureNotification(buildProject: cbuild.Project, message: string) {
    if (!this.notify) {
      return;
    }

    buildProject.onBuildFailed('OnBuildFailed').addTarget(new events_targets.SnsTopic(this.notify, {
      message: events.RuleTargetInput.fromText(message),
    }));
  }

  /**
   * @returns the stage or undefined if the stage doesn't exist
   */
  private getStage(stageName: string): cpipeline.IStage | undefined {
    return this.stages[stageName];
  }

  private getOrCreateStage(stageName: string, placement?: cpipeline.StagePlacement): cpipeline.IStage {
    // otherwise, group all actions so they run concurrently.
    let stage = this.getStage(stageName);
    if (!stage) {
      stage = this.pipeline.addStage({
        stageName,
        placement,
      });
      this.stages[stageName] = stage;
    }
    return stage;
  }

  private determineRunOrderForNewAction(stage: cpipeline.IStage): number | undefined {
    return determineRunOrder(stage.actions.length, this.concurrency);
  }
}

export interface IPublisher extends cdk.IConstruct {
  addToPipeline(stage: cpipeline.IStage, id: string, options: AddToPipelineOptions): void;
}

export interface AddToPipelineOptions {
  inputArtifact?: cpipeline.Artifact;
  runOrder?: number;
}

export interface AddChangeControlOptions {
  /**
   * The bucket in which the ChangeControl iCal document will be stored.
   *
   * @default a new bucket will be provisioned.
   */
  changeControlBucket?: s3.IBucket;

  /**
   * The key in which the iCal fille will be stored.
   *
   * @default 'change-control.ical'
   */
  changeControlObjectKey?: string;

  /**
   * Schedule to run the change controller on
   *
   * @default rate(15 minutes)
   */
  scheduleExpression?: string;
}
export interface AddPublishOptions {
  /**
   * The input artifact to use
   *
   * @default Build output artifact
   */
  inputArtifact?: cpipeline.Artifact;
}

export interface AddShellableOptions extends ShellableProps {
  /**
   * String to use as action name
   *
   * @default Id
   */
  actionName?: string;

  /**
   * Message to use as failure notification
   *
   * @default No notification
   */
  failureNotification?: string;

  /**
   * The input artifact to use
   *
   * @default Build output artifact
   */
  inputArtifact?: cpipeline.Artifact;
}
