import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import events = require('@aws-cdk/aws-events');
import iam = require('@aws-cdk/aws-iam');
import lambda = require('@aws-cdk/aws-lambda');
import logs = require('@aws-cdk/aws-logs');
import sns = require('@aws-cdk/aws-sns');
import cdk = require('@aws-cdk/cdk');
import fs = require('fs');
import path = require('path');
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
  private readonly dashboard: cloudwatch.Dashboard;
  private readonly notify?: sns.Topic;
  private readonly title: string;
  private testStage?: cpipeline.Stage;
  private publishStage?: cpipeline.Stage;

  constructor(parent: cdk.Construct, name: string, props: PipelineProps) {
    super(parent, name);

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

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard');
    this.title = props.title || 'Pipeline';

    // tslint:disable:max-line-length
    const markdown = new cdk.FnConcat(
      `# ${this.title} Pipeline\n`,
      ' * [Pipeline](https://console.aws.amazon.com/codepipeline/home?region=', new cdk.AwsRegion(), '#/view/', this.pipeline.pipelineName, ')\n',
      ' * [Build History](https://console.aws.amazon.com/codebuild/home?region=', new cdk.AwsRegion(), '#/projects/', buildProject.projectName, '/view', ')\n'
    );
    // tslint:enable:max-line-length

    // define an alarm triggered when the build fails.
    if (this.notify) {
      const alarm = buildProject.metricFailedBuilds().newAlarm(this, 'FailedBuildsAlarm', {
        threshold: 1,
        evaluationPeriods: 1,
      });

      alarm.onAlarm(this.notify);
    }

    this.dashboard.add(
      new cloudwatch.TextWidget({
        width: 24,
        markdown: markdown as any
      }),
      new cloudwatch.GraphWidget({
        title: 'Build Duration',
        left: [ buildProject.metricDuration() ]
      }
    ));
  }

  public addTest(id: string, props: TestableProps) {
    if (!this.testStage) {
      this.testStage = new cpipeline.Stage(this, 'Test', { pipeline: this.pipeline });
    }

    const test = new Testable(this, id, props);
    test.addToPipeline(this.testStage, this.buildOutput);

    this.dashboard.add(
      new cloudwatch.GraphWidget({
        title: `Test ${id} Duration`,
        left: [ test.project.metricDuration() ]
      })
    );

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
    if (!this.publishStage) {
      this.publishStage = new cpipeline.Stage(this, 'Publish', { pipeline: this.pipeline });
    }
    publisher.project.addToPipeline(this.publishStage, `${publisher.id}Publish`, { inputArtifact: this.buildOutput });
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
}

interface PipelineWatcherProps {
  /**
   * Code Pipeline to monitor for failed stages
   */
  pipeline: cpipeline.Pipeline;

  /**
   * Set the pipelineName of the alarm description.
   *
   * Description is set to 'Pipeline <title> has failed stages'
   *
   * @default pipeline's name
   */
  title?: string;
}

/**
 * Construct which watches a Code Pipeline for failed stages and raises an alarm
 * if there are any failed stages.
 *
 * A function runs every minute and calls GetPipelineState for the provided pipeline's
 * name, counts the number of failed stages and emits a JSON log { failedCount: <number> }.
 * A metric filter is then configured to track this value as a CloudWatch metric, and
 * a corresponding alarm is set to fire when the maximim value of a single 5-minute interval
 * is >= 1.
 */
class PipelineWatcher extends cdk.Construct {
  public readonly alarm: cloudwatch.Alarm;

  constructor(parent: cdk.Construct, name: string, props: PipelineWatcherProps) {
    super(parent, name);

    const pipelineWatcher = new lambda.Function(this, 'Poller', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NodeJS810,
      code: lambda.Code.inline(fs.readFileSync(path.join(__dirname, 'pipeline-watcher.js')).toString('utf8')),
      environment: {
        pipelineName: props.pipeline.pipelineName
      }
    });

    // See https://github.com/awslabs/aws-cdk/issues/1340 for exposing grants on the pipeline.
    pipelineWatcher.addToRolePolicy(new iam.PolicyStatement()
      .addResource(props.pipeline.pipelineArn)
      .addAction('codepipeline:GetPipelineState'));

    // Explicitly and pre-emptively create the function's log group because we need it for the metric filter.
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: new cdk.FnConcat('/aws/lambda/', pipelineWatcher.functionName).toString(),
      retentionDays: 731
    });

    new events.EventRule(this, 'Trigger', {
      scheduleExpression: 'rate(1 minute)',
      targets: [pipelineWatcher]
    });

    const metricName = 'FailedStages';
    // TODO: This creates a long namespace, better alternatives?
    const metricNamespace = new cdk.FnConcat('CodePipeline/', props.pipeline.pipelineName).toString();

    new logs.MetricFilter(this, 'MetricFilter', {
      filterPattern: logs.FilterPattern.exists('$.failedCount'),
      metricNamespace,
      metricName,
      metricValue: '$.failedCount',
      logGroup
    });

    this.alarm = new cloudwatch.Alarm(this, 'Alarm', {
      alarmDescription: new cdk.FnConcat('Pipeline ', props.title || props.pipeline.pipelineName, ' has failed failed stages').toString(),
      metric: new cloudwatch.Metric({
        metricName,
        namespace: metricNamespace,
        statistic: cloudwatch.Statistic.Maximum
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GreaterThanOrEqualToThreshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.Ignore, // We expect a steady stream of data points
    });
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
