import {
  Construct, Duration, IConstruct,
  aws_chatbot as chatbot,
  aws_cloudwatch as cloudwatch,
  aws_codebuild as cbuild,
  aws_codepipeline as cpipeline,
  aws_codepipeline_actions as cpipeline_actions,
  aws_codestarnotifications as starnotifs,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam, aws_s3 as s3,
  aws_sns as sns,
  aws_sns_subscriptions as sns_subs,
} from 'monocdk';
import { CodeBuildAction } from 'monocdk/lib/aws-codepipeline-actions';

import { AutoBuild, AutoBuildOptions } from './auto-build';
import { createBuildEnvironment } from './build-env';
import { Canary, CanaryProps } from './canary';
import { ChangeController } from './change-controller';
import { ChimeNotifier } from './chime-notifier';
import { PipelineWatcher } from './pipeline-watcher';
import * as publishing from './publishing';
import { AutoBump, AutoMergeBack, AutoMergeBackProps, AutoBumpProps } from './pull-request';
import { IRepo, WritableGitHubRepo } from './repo';
import { Shellable, ShellableProps } from './shellable';
import { determineRunOrder } from './util';

const PUBLISH_STAGE_NAME = 'Publish';
const TEST_STAGE_NAME = 'Test';

export interface PipelineProps {
  /**
   * The source repository to build (e.g. GitHubRepo).
   */
  readonly repo: IRepo;

  /**
   * A display name for this pipeline.
   */
  readonly title?: string;

  /**
   * A physical name for this pipeline.
   * @default - a new name will be generated.
   */
  readonly pipelineName?: string;

  /**
   * Branch to build.
   * @default master
   */
  readonly branch?: string;

  /**
   * Email to send failure notifications.
   * @default - No email notifications
   */
  readonly notificationEmail?: string;

  /**
   * The image used for the builds.
   *
   * @default jsii/superchain (see docs)
   */
  readonly buildImage?: cbuild.IBuildImage;

  /**
   * The name of the CodeBuild project that will be part of this pipeline.
   * @default - `${pipelineName}-Build`, if `pipelineName` property is specified; automatically generated, otherwise.
   */
  readonly buildProjectName?: string;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default taken from {@link #buildImage#defaultComputeType}
   */
  readonly computeType?: cbuild.ComputeType;

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
  readonly privileged?: boolean;

  /**
   * Environment variables to pass to build
   */
  readonly environment?: { [key: string]: string };

  /**
   * Optional buildspec, as an alternative to a buildspec.yml file
   */
  readonly buildSpec?: cbuild.BuildSpec;

  /**
   * Indicates whether to re-run the pipeline after you've updated it.
   * @default true
   */
  readonly restartExecutionOnUpdate?: boolean;

  /**
   * Indicates the concurrency limit test and publish stages.
   *
   * For example, if this value is 2, then only two actions will execute concurrently.
   * If this value is 1, the pipeline will not have any concurrent execution.
   *
   * @default - no limit
   */
  readonly concurrency?: number;

  /**
   * Set the default dryRun for all publishing steps
   *
   * (Can still be changed when adding a step).
   *
   * @default false
   */
  readonly dryRun?: boolean;

  /**
   * Automatically build commits that are pushed to this repository, including PR builds on github.
   *
   * @default false
   */
  readonly autoBuild?: boolean;

  /**
   * Options for auto-build
   *
   * @default - 'autoBuildOptions.publicLogs' will be set to its default. 'autoBuildOptions.buildspec' will be configured to match with the
   * 'buildSpec' property.
   */
  readonly autoBuildOptions?: AutoBuildOptions;

  /**
   * Post a notification to the given Chime webhooks if the pipeline fails
   *
   * @default - no Chime notifications on pipeline failure
   */
  readonly chimeFailureWebhooks?: string[];

  /**
   * The Chime message to post
   *
   * @default - A default message
   */
  readonly chimeMessage?: string;

  /**
   * Build timeout
   *
   * How long the build can take at maximum (before failing with an error).
   *
   * @default - Duration.hours(8)
   */
  readonly buildTimeout?: Duration;

  /**
   * Slack channel configurations where failure notification
   * in this pipeline should be sent.
   */
  readonly failureNotifySlack?: chatbot.SlackChannelConfiguration[];
}

export interface MergeBackStage {

  /**
   * Which stage should the merge back be part of. (Created if missing)
   *
   * @default 'MergeBack'
   */
  readonly name?: string

  /**
   * The name of the stage that the merge back stage should go after of. (Must exist)
   */
  readonly after: string;
}

/**
 * Options for configuring an auto merge-back for this pipeline.
 */
export interface AutoMergeBackOptions extends Omit<AutoMergeBackProps, 'repo'> {

  /**
   * Specify stage options to create the merge back inside a stage of the pipeline.
   *
   * @default - The CodeBuild project will be created indepdent of any stage.
   */
  readonly stage?: MergeBackStage
}

/**
 * Options for configuring an auto bump for this pipeline.
 */
export interface AutoBumpOptions extends Omit<AutoBumpProps, 'repo'> {
}

/**
 * Defines a delivlib CI/CD pipeline.
 */
export class Pipeline extends Construct {
  public buildRole?: iam.IRole;
  public readonly failureAlarm: cloudwatch.Alarm;
  public readonly buildOutput: cpipeline.Artifact;
  public readonly sourceArtifact: cpipeline.Artifact;

  /**
   * The primary CodeBuild project of this pipeline.
   */
  public readonly buildProject: cbuild.IProject;

  /**
   * The auto build project. undefined if 'autoBuild' is disabled for this pipeline.
   */
  public readonly autoBuildProject?: cbuild.IProject;

  private readonly pipeline: cpipeline.Pipeline;
  private readonly branch: string;
  private readonly notify?: sns.Topic;
  private stages: { [name: string]: cpipeline.IStage } = { };

  private readonly concurrency?: number;
  private readonly repo: IRepo;
  private readonly dryRun: boolean;
  private readonly buildEnvironment: cbuild.BuildEnvironment;
  private readonly buildSpec?: cbuild.BuildSpec;

  constructor(parent: Construct, name: string, props: PipelineProps) {
    super(parent, name);

    this.concurrency = props.concurrency;
    this.repo = props.repo;
    this.dryRun = !!props.dryRun;

    this.pipeline = new cpipeline.Pipeline(this, 'BuildPipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: props.restartExecutionOnUpdate === undefined ? true : props.restartExecutionOnUpdate,
    });

    this.branch = props.branch || 'master';
    this.sourceArtifact = props.repo.createSourceStage(this.pipeline, this.branch);

    this.buildEnvironment = createBuildEnvironment(props);
    this.buildSpec = props.buildSpec;

    let buildProjectName = props.buildProjectName;
    if (buildProjectName === undefined && props.pipelineName !== undefined) {
      buildProjectName = `${props.pipelineName}-Build`;
    }
    this.buildProject = new cbuild.PipelineProject(this, 'BuildProject', {
      projectName: buildProjectName,
      environment: this.buildEnvironment,
      buildSpec: this.buildSpec,
      timeout: props.buildTimeout ?? Duration.hours(8),
    });

    this.buildRole = this.buildProject.role;

    const buildStage = this.getOrCreateStage('Build');
    const buildOutput = new cpipeline.Artifact();
    buildStage.addAction(new cpipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: this.buildProject,
      input: this.sourceArtifact,
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
    this.addBuildFailureNotification(this.buildProject, `${props.title} build failed`);

    // Also emit to Chime webhooks if configured
    if (props.chimeFailureWebhooks) {
      new ChimeNotifier(this, 'ChimeNotifier', {
        pipeline: this.pipeline,
        message: props.chimeMessage,
        webhookUrls: props.chimeFailureWebhooks,
      });
    }

    if (props.autoBuild) {
      this.autoBuildProject = this.autoBuild(props.autoBuildOptions).project;
    }

    if (props.failureNotifySlack && props.failureNotifySlack.length > 0) {
      props.failureNotifySlack.forEach(s => {
        new starnotifs.CfnNotificationRule(this, `FailureSlackNotification-${s.slackChannelConfigurationName}`, {
          name: `${this.pipeline.pipelineName}-failednotifications`,
          detailType: 'BASIC',
          resource: this.pipeline.pipelineArn,
          targets: [
            {
              targetAddress: s.slackChannelConfigurationArn,
              targetType: 'AWSChatbotSlack',
            },
          ],
          eventTypeIds: ['codepipeline-pipeline-action-execution-failed'],
        });
      });
    }
  }

  /**
   * Add an action to run a shell script to the pipeline
   */
  public addShellable(stageName: string, id: string, options: AddShellableOptions): {shellable: Shellable, action: CodeBuildAction} {
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

    return { shellable: sh, action };
  }

  public addTest(id: string, props: ShellableProps): {shellable: Shellable, action: CodeBuildAction} {
    return this.addShellable(TEST_STAGE_NAME, id, {
      actionName: `Test${id}`,
      failureNotification: `Test ${id} failed`,
      ...props,
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
      runOrder: this.determineRunOrderForNewAction(stage),
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
      ...options,
    }));
  }

  public publishToMaven(options: publishing.PublishToMavenProjectProps) {
    this.addPublish(new publishing.PublishToMavenProject(this, 'Maven', {
      dryRun: this.dryRun,
      ...options,
    }));
  }

  public publishToNuGet(options: publishing.PublishToNuGetProjectProps) {
    this.addPublish(new publishing.PublishToNuGetProject(this, 'NuGet', {
      dryRun: this.dryRun,
      ...options,
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
      ...options,
    }));
  }

  public publishToPyPI(options: publishing.PublishToPyPiProps) {
    this.addPublish(new publishing.PublishToPyPi(this, 'PyPI', {
      dryRun: this.dryRun,
      ...options,
    }));
  }

  public publishToS3(id: string, options: publishing.PublishToS3Props & AddPublishOptions) {
    this.addPublish(new publishing.PublishToS3(this, id, {
      dryRun: this.dryRun,
      ...options,
    }), options);
  }

  /**
   * Enables automatic bumps for the source repo.
   * @param options Options for auto bump (see AutoBumpOptions for description of defaults)
   */
  public autoBump(options?: AutoBumpOptions): AutoBump {
    if (!WritableGitHubRepo.isWritableGitHubRepo(this.repo)) {
      throw new Error('"repo" must be a WritableGitHubRepo in order to enable auto-bump');
    }

    const autoBump = new AutoBump(this, 'AutoBump', {
      repo: this.repo,
      ...options,
    });

    return autoBump;
  }

  /**
   * Enables automatic merge backs for the source repo.
   * @param options Options for auto bump (see AutoMergeBackOptions for description of defaults)
   */
  public autoMergeBack(options?: AutoMergeBackOptions) {
    if (!WritableGitHubRepo.isWritableGitHubRepo(this.repo)) {
      throw new Error('"repo" must be a WritableGitHubRepo in order to enable auto-merge-back');
    }

    const mergeBack = new AutoMergeBack(this, 'MergeBack', {
      repo: this.repo,
      ...options,
    });

    if (options?.stage) {

      const afterStage = this.getStage(options.stage.after);

      if (!afterStage) {
        throw new Error(`'options.stage.after' must be configured to an existing stage: ${options.stage.after}`);
      }

      const stage = this.getOrCreateStage(options.stage.name ?? 'MergeBack', { justAfter: afterStage });
      stage.addAction(new cpipeline_actions.CodeBuildAction({
        actionName: 'CreateMergeBackPullRequest',
        project: mergeBack.pr.project,
        input: this.sourceArtifact,
      }));
    }
  }

  /**
   * Enables automatic builds of pull requests in the Github repository and posts the
   * results back as a comment with a public link to the build logs.
   */
  public autoBuild(options: AutoBuildOptions = { }): AutoBuild {
    return new AutoBuild(this, 'AutoBuild', {
      environment: this.buildEnvironment,
      repo: this.repo,
      buildSpec: options.buildSpec || this.buildSpec,
      ...options,
    });
  }

  private addFailureAlarm(title?: string): cloudwatch.Alarm {
    return new PipelineWatcher(this, 'PipelineWatcher', {
      pipeline: this.pipeline,
      title,
    }).alarm;
  }

  private addBuildFailureNotification(buildProject: cbuild.IProject, message: string) {
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

export interface IPublisher extends IConstruct {
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
