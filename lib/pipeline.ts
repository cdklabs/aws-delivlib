import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import iam = require('@aws-cdk/aws-iam');
import sns = require('@aws-cdk/aws-sns');
import cdk = require('@aws-cdk/cdk');
import { Canary, CanaryProps } from './canary';
import { PipelineWatcher } from './pipeline-watcher';
import publishing = require('./publishing');
import { IRepo } from './repo';
import { Shellable, ShellableProps } from './shellable';
import { Superchain } from './superchain';
import { determineRunOrder, renderEnvironmentVariables } from './util';

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
  env?: { [key: string]: string };

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
}

/**
 * Defines a delivlib CI/CD pipeline.
 */
export class Pipeline extends cdk.Construct {
  public buildRole?: iam.Role;
  public readonly failureAlarm: cloudwatch.Alarm;

  private readonly pipeline: cpipeline.Pipeline;
  private readonly buildOutput: cpipelineapi.Artifact;
  private readonly branch: string;
  private readonly notify?: sns.Topic;
  private stages: { [name: string]: cpipeline.Stage } = { };

  private readonly concurrency?: number;

  constructor(parent: cdk.Construct, name: string, props: PipelineProps) {
    super(parent, name);

    this.concurrency = props.concurrency;

    this.pipeline = new cpipeline.Pipeline(this, 'BuildPipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: props.restartExecutionOnUpdate === undefined ? true : props.restartExecutionOnUpdate
    });

    this.branch = props.branch || 'master';
    const source = props.repo.createSourceStage(this.pipeline, this.branch);

    const environment: cbuild.BuildEnvironment = {
      computeType: props.computeType || cbuild.ComputeType.Small,
      privileged: props.privileged,
      environmentVariables: renderEnvironmentVariables(props.env),
      buildImage: props.buildImage || new Superchain(this).buildImage
    };

    const buildProject = new cbuild.PipelineProject(this, 'BuildProject', {
      environment,
      buildSpec: props.buildSpec,
    });

    this.buildRole = buildProject.role;

    const buildStage = new cpipeline.Stage(this, 'Build', { pipeline: this.pipeline });
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

  public addTest(id: string, props: ShellableProps) {
    const stage = this.getOrCreateStage('Test');

    const test = new Shellable(this, id, props);
    test.addToPipeline(stage, `Test${id}`, this.buildOutput, this.determineRunOrderForNewAction(stage));

    this.addBuildFailureNotification(test.project, `Test ${id} failed`);
  }

  /**
   * Convinience/discovery method that defines a canary test in your account.
   * @param id the construct id
   * @param props canary options
   */
  public addCanary(id: string, props: CanaryProps) {
    return new Canary(this, `Canary${id}`, props);
  }

  public addPublish(publisher: IPublisher) {
    const stage = this.getOrCreateStage('Publish');

    publisher.project.addToPipeline(stage, `${publisher.id}Publish`, {
      inputArtifact: this.buildOutput,
      runOrder: this.determineRunOrderForNewAction(stage)
    });
  }

  public publishToNpm(options: publishing.PublishToNpmProjectProps) {
    this.addPublish(new publishing.PublishToNpmProject(this, 'Npm', {
      dryRun: false,
      ...options
    }));
  }

  public publishToMaven(options: publishing.PublishToMavenProjectProps) {
    this.addPublish(new publishing.PublishToMavenProject(this, 'Maven', {
      dryRun: false,
      ...options
    }));
  }

  public publishToNuGet(options: publishing.PublishToNuGetProjectProps) {
    this.addPublish(new publishing.PublishToNuGetProject(this, 'NuGet', {
      dryRun: false,
      ...options
    }));
  }

  public publishToGitHubPages(options: publishing.PublishDocsToGitHubProjectProps) {
    this.addPublish(new publishing.PublishDocsToGitHubProject(this, 'GitHubPages', {
      dryRun: false,
      ...options,
    }));
  }

  public publishToGitHub(options: publishing.PublishToGitHubProps) {
    this.addPublish(new publishing.PublishToGitHub(this, 'GitHub', {
      dryRun: false,
      ...options
    }));
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

  private getOrCreateStage(stageName: string) {
    // otherwise, group all actions so they run concurrently.
    let stage = this.stages[stageName];
    if (!stage) {
      stage = new cpipeline.Stage(this, stageName, { pipeline: this.pipeline });
      this.stages[stageName] = stage;
    }
    return stage;
  }

  private determineRunOrderForNewAction(stage: cpipeline.Stage) {
    return determineRunOrder(stage.actions.length, this.concurrency);
  }
}

export interface IPublisher {
  /**
   * The identifier for the publisher.
   */
  readonly id: string;

  /**
   * The publisher's codebuild project.
   */
  readonly project: cbuild.Project;
}
