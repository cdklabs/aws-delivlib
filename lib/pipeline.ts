import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import iam = require('@aws-cdk/aws-iam');
import sns = require('@aws-cdk/aws-sns');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { PipelineWatcher } from './pipeline-watcher';
import publishing = require('./publishing');
import { IRepo } from './repo';
import { Testable, TestableProps } from './testable';

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
   * Email to send notifications.
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
   * Enables tests and publishers to be executed concurrently in the pipeline.
   *
   * You can set this to "false" if, for example, your account has an AWS CodeBuild
   * concurrency limitation.
   *
   * @default true
   */
  concurrency?: boolean;
}

/**
 * Defines a delivlib CI/CD pipeline.
 */
export class Pipeline extends cdk.Construct {
  public buildRole?: iam.Role;

  private readonly pipeline: cpipeline.Pipeline;
  private readonly buildOutput: cpipelineapi.Artifact;
  private readonly repo: string;
  private readonly branch: string;
  private readonly notify?: sns.Topic;
  private readonly title: string;
  private stages: { [name: string]: cpipeline.Stage } = { };

  private readonly concurrency: boolean;

  constructor(parent: cdk.Construct, name: string, props: PipelineProps) {
    super(parent, name);

    this.concurrency = props.concurrency === undefined ? true : props.concurrency;
    this.pipeline = new cpipeline.Pipeline(this, 'BuildPipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: props.restartExecutionOnUpdate === undefined ? true : props.restartExecutionOnUpdate
    });

    this.repo = props.repo.describe();
    this.branch = props.branch || 'master';
    const source = props.repo.createSourceStage(this.pipeline, this.branch);

    const environment: cbuild.BuildEnvironment = {
      computeType: props.computeType || cbuild.ComputeType.Small,
      privileged: props.privileged,
      environmentVariables: renderEnvironmentVariables(props.env),
      buildImage: props.buildImage || cbuild.LinuxBuildImage.fromAsset(this, 'superchain', {
        directory: path.join(__dirname, '..', 'superchain')
      })
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

    if (this.notify) {
      buildProject.onBuildStarted('OnBuildStarted').addTarget(this.notify, {
        textTemplate: new cdk.FnConcat('[in-progress] ', this.repo, ` branch ${this.branch} - build started`)
      });

      buildProject.onBuildSucceeded('OnBuildSuccessful').addTarget(this.notify, {
        textTemplate: new cdk.FnConcat('[success] ', this.repo, ` branch ${this.branch} - build succeeded.`)
      });

      buildProject.onBuildFailed('OnBuildFailed').addTarget(this.notify, {
        textTemplate: new cdk.FnConcat('[failure] ', this.repo, ` branch ${this.branch} - build failed`)
      });
    }

    // trigger an SNS topic every time the pipeline fails
    this.addFailureAlarm(props.title);

    this.title = props.title || 'Pipeline';

    // define an alarm triggered when the build fails.
    if (this.notify) {
      const alarm = buildProject.metricFailedBuilds().newAlarm(this, 'FailedBuildsAlarm', {
        threshold: 1,
        evaluationPeriods: 1,
      });

      alarm.onAlarm(this.notify);
    }
  }

  public addTest(id: string, props: TestableProps) {
    const stage = this.getOrCreateStage('Test', id);

    const test = new Testable(this, id, props);
    test.addToPipeline(stage, this.buildOutput);

    if (this.notify) {
      const alarm = test.project.metricFailedBuilds().newAlarm(test /* add as child of test */, 'FailedTests', {
        alarmDescription: `Test ${id} in pipeline ${this.title} has failed`,
        threshold: 1,
        evaluationPeriods: 1
      });

      alarm.onAlarm(this.notify);
    }
  }

  public addPublish(publisher: IPublisher) {
    const stage = this.getOrCreateStage('Publish', publisher.id);
    publisher.project.addToPipeline(stage, `${publisher.id}Publish`, { inputArtifact: this.buildOutput });
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
  private getOrCreateStage(group: string, actionId: string) {
    // if concurrency is disabled, create a new stage for each action.
    if (!this.concurrency) {
      return new cpipeline.Stage(this, `${group}${actionId}`, { pipeline: this.pipeline });
    }

    // otherwise, group all actions so they run concurrently.
    let stage = this.stages[group];
    if (!stage) {
      stage = new cpipeline.Stage(this, group, { pipeline: this.pipeline });
      this.stages[group] = stage;
    }
    return stage;
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

function renderEnvironmentVariables(env?: { [key: string]: string }) {
  if (!env) {
    return undefined;
  }

  const out: { [key: string]: cbuild.BuildEnvironmentVariable } = { };
  for (const [key, value] of Object.entries(env)) {
    out[key] = { value };
  }
  return out;
}
