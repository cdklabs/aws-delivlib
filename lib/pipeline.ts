import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import sns = require('@aws-cdk/aws-sns');
import cdk = require('@aws-cdk/cdk');
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
   * @default superchain (see docs)
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
  buildSpec?: any;

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
}

/**
 * Defines a delivlib CI/CD pipeline.
 */
export class Pipeline extends cdk.Construct {
  public buildRole?: iam.Role;
  public readonly failureAlarm: cloudwatch.Alarm;
  public readonly buildOutput: cpipelineapi.Artifact;

  private readonly pipeline: cpipeline.Pipeline;
  private readonly branch: string;
  private readonly notify?: sns.Topic;
  private stages: { [name: string]: cpipeline.Stage } = { };

  private readonly concurrency?: number;
  private readonly repo: IRepo;
  private readonly dryRun: boolean;

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
    const source = props.repo.createSourceStage(this.pipeline, this.branch);

    const buildProject = new cbuild.PipelineProject(this, 'BuildProject', {
      environment: createBuildEnvironment(this, props),
      buildSpec: props.buildSpec,
    });

    this.buildRole = buildProject.role;

    const buildStage = this.getOrCreateStage('Build');
    const build = buildProject.addToPipeline(buildStage, 'Build', { inputArtifact: source.outputArtifact });

    this.buildOutput = build.outputArtifact;

    if (props.notificationEmail) {
      this.notify = new sns.Topic(this, 'NotificationsTopic');
      this.notify.subscribeEmail('NotifyEmail', props.notificationEmail);
    }

    // add a failure alarm for the entire pipeline.
    this.failureAlarm = this.addFailureAlarm(props.title);

    // emit an SNS notification every time build fails.
    this.addBuildFailureNotification(buildProject, `${props.title} build failed`);
  }

  /**
   * Add an action to run a shell script to the pipeline
   */
  public addShellable(stageName: string, id: string, options: AddShellableOptions): cbuild.PipelineBuildAction {
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

  public addTest(id: string, props: ShellableProps) {
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

    buildProject.onBuildFailed('OnBuildFailed').addTarget(this.notify, {
      textTemplate: message
    });
  }

  /**
   * @returns the stage or undefined if the stage doesn't exist
   */
  private getStage(stageName: string): cpipeline.Stage | undefined {
    return this.stages[stageName];
  }

  private getOrCreateStage(stageName: string, placement?: cpipeline.StagePlacement) {
    // otherwise, group all actions so they run concurrently.
    let stage = this.getStage(stageName);
    if (!stage) {
      stage = new cpipeline.Stage(this, stageName, { pipeline: this.pipeline, placement });
      this.stages[stageName] = stage;
    }
    return stage;
  }

  private determineRunOrderForNewAction(stage: cpipeline.Stage) {
    return determineRunOrder(stage.actions.length, this.concurrency);
  }
}

export interface IPublisher extends cdk.IConstruct {
  addToPipeline(stage: cpipeline.Stage, id: string, options: AddToPipelineOptions): void;
}

export interface AddToPipelineOptions {
  inputArtifact?: cpipelineapi.Artifact;
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
  inputArtifact?: cpipelineapi.Artifact;
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
  inputArtifact?: cpipelineapi.Artifact;

  /**
   * Additional output artifact names
   */
  additionalOutputArtifactNames?: string[];
}