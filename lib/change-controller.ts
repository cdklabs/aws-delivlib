import { aws_cloudwatch as cloudwatch, aws_codepipeline as cp, aws_events as
  events, aws_events_targets as events_targets, aws_iam as iam, aws_lambda as
  lambda, aws_s3 as s3, aws_s3_notifications as s3_notifications }
  from "monocdk";
  import * as cdk from 'monocdk';
import path = require("path");

export interface ChangeControllerProps {
  /**
   * The bucket in which the ChangeControl iCal document will be stored.
   *
   * @default a new versioned bucket will be provisioned.
   */
  changeControlBucket?: s3.IBucket;

  /**
   * The key in which the iCal fille will be stored.
   *
   * @default 'change-control.ical'
   */
  changeControlObjectKey?: string;

  /**
   * Name of the stage
   */
  pipelineStage: cp.IStage;

  /**
   * Schedule to run the change controller on
   *
   * @default once every 15 minutes
   */
  schedule?: events.Schedule;

  /**
   * Whether to create outputs to inform of the S3 bucket name and keys where the change control calendar should be
   * stored.
   *
   * @defaults true
   */
  createOutputs?: boolean;
}

/**
 * Controls enabling and disabling a CodePipeline promotion into a particular stage based on "blocking" windows that are
 * configured in an iCal document stored in an S3 bucket. If the document is not present or the bucket does not exist,
 * the transition will be disabled.
 */
export class ChangeController extends cdk.Construct {
  /**
   * The alarm that will fire in case the change controller has failed.
   */
  public readonly failureAlarm: cloudwatch.Alarm;

  constructor(scope: cdk.Construct, id: string, props: ChangeControllerProps) {
    super(scope, id);

    let changeControlBucket = props.changeControlBucket;
    let ownBucket: s3.Bucket | undefined;

    if (!changeControlBucket) {
      changeControlBucket = ownBucket = new s3.Bucket(this, 'Calendar', {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        versioned: true,
      });
    }

    // const changeControlBucket = props.changeControlBucket || new s3.Bucket(this, 'Bucket', { versioned: true });
    const changeControlObjectKey = props.changeControlObjectKey || 'change-control.ics';

    const fn = new lambda.Function(this, 'Function', {
      description: `Enforces a Change Control Policy into CodePipeline's ${props.pipelineStage.stageName} stage`,
      code: lambda.Code.asset(path.join(__dirname, '../change-control-lambda')),
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: 'index.handler',
      environment: {
        // CAPITAL punishment 👌🏻
        CHANGE_CONTROL_BUCKET_NAME: changeControlBucket.bucketName,
        CHANGE_CONTROL_OBJECT_KEY: changeControlObjectKey,
        PIPELINE_NAME: props.pipelineStage.pipeline.pipelineName,
        STAGE_NAME: props.pipelineStage.stageName,
      },
      timeout: cdk.Duration.seconds(300),
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      resources: [`${props.pipelineStage.pipeline.pipelineArn}/${props.pipelineStage.stageName}`],
      actions: ['codepipeline:EnableStageTransition', 'codepipeline:DisableStageTransition'],
    }));

    changeControlBucket.grantRead(fn, props.changeControlObjectKey);

    if (ownBucket) {
      ownBucket.addObjectCreatedNotification(new s3_notifications.LambdaDestination(fn), {
        prefix: changeControlObjectKey,
      });
    }

    this.failureAlarm = new cloudwatch.Alarm(this, 'Failed', {
      metric: fn.metricErrors(),
      threshold: 1,
      datapointsToAlarm: 1,
      period: cdk.Duration.seconds(300),
      evaluationPeriods: 1
    });

    const schedule = props.schedule || events.Schedule.expression('rate(15 minutes)');

    // Run this on a schedule
    new events.Rule(this, 'Rule', {
      // tslint:disable-next-line:max-line-length
      description: `Run the change controller for promotions into ${props.pipelineStage.pipeline.pipelineName}'s ${props.pipelineStage.stageName} on a ${schedule} schedule`,
      schedule,
      targets: [new events_targets.LambdaFunction(fn)],
    });

    if (props.createOutputs !== false) {
      new cdk.CfnOutput(this, 'ChangeControlBucketKey', {
        value: changeControlObjectKey
      });

      new cdk.CfnOutput(this, 'ChangeControlBucket', {
        value: changeControlBucket.bucketName
      });
    }
  }
}
