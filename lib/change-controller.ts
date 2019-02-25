import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import cp = require('@aws-cdk/aws-codepipeline-api');
import events = require('@aws-cdk/aws-events');
import iam = require('@aws-cdk/aws-iam');
import lambda = require('@aws-cdk/aws-lambda');
import s3 = require('@aws-cdk/aws-s3');
import cdk = require('@aws-cdk/cdk');
import path = require('path');

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
   * @default rate(15 minutes)
   */
  scheduleExpression?: string;

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
        removalPolicy: cdk.RemovalPolicy.Destroy,
        versioned: true,
      });
    }

    // const changeControlBucket = props.changeControlBucket || new s3.Bucket(this, 'Bucket', { versioned: true });
    const changeControlObjectKey = props.changeControlObjectKey || 'change-control.ics';

    const fn = new lambda.Function(this, 'Function', {
      description: `Enforces a Change Control Policy into CodePipeline's ${props.pipelineStage.name} stage`,
      code: lambda.Code.asset(path.join(__dirname, '../change-control-lambda')),
      runtime: lambda.Runtime.NodeJS810,
      handler: 'index.handler',
      environment: {
        // CAPITAL punishment 👌🏻
        CHANGE_CONTROL_BUCKET_NAME: changeControlBucket.bucketName,
        CHANGE_CONTROL_OBJECT_KEY: changeControlObjectKey,
        PIPELINE_NAME: props.pipelineStage.pipeline.pipelineName,
        STAGE_NAME: props.pipelineStage.name
      },
      timeout: 300
    });

    fn.addToRolePolicy(new iam.PolicyStatement()
      .addResource(`${props.pipelineStage.pipeline.pipelineArn}/${props.pipelineStage.name}`)
      .addActions('codepipeline:EnableStageTransition', 'codepipeline:DisableStageTransition'));

    changeControlBucket.grantRead(fn.role, props.changeControlObjectKey);

    if (ownBucket) {
      ownBucket.onObjectCreated(fn, { prefix: changeControlObjectKey });
    }

    this.failureAlarm = new cloudwatch.Alarm(this, 'Failed', {
      metric: fn.metricErrors(),
      threshold: 1,
      datapointsToAlarm: 1,
      periodSec: 300,
      evaluationPeriods: 1
    });

    const scheduleExpression = props.scheduleExpression || 'rate(15 minutes)';

    // Run this on a schedule
    new events.EventRule(this, 'Rule', {
      // tslint:disable-next-line:max-line-length
      description: `Run the change controller for promotions into ${props.pipelineStage.pipeline.pipelineName}'s ${props.pipelineStage.name} on a ${scheduleExpression} schedule`,
      scheduleExpression,
      targets: [fn]
    });

    if (props.createOutputs !== false) {
      new cdk.Output(this, 'ChangeControlBucketKey', {
        value: changeControlObjectKey
      });

      new cdk.Output(this, 'ChangeControlBucket', {
        value: changeControlBucket.bucketName
      });
    }
  }
}
