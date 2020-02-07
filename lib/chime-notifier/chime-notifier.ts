import { Construct, Duration } from "@aws-cdk/core";
import * as cpipeline from '@aws-cdk/aws-codepipeline';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events_targets from '@aws-cdk/aws-events-targets';
import fs = require('fs');
import path = require('path');

/**
 * Properties for a ChimeNotifier
 */
export interface ChimeNotifierProps {
  /**
   * Chime webhook URLs to send to
   */
  readonly webhookUrls: string[];

  /**
   * Code Pipeline to listen to
   */
  readonly pipeline: cpipeline.IPipeline;
}

/**
 * Send a message to a Chime room when a pipeline fails
 */
export class ChimeNotifier extends Construct {
  constructor(scope: Construct, id: string, props: ChimeNotifierProps) {
    super(scope, id);

    if (props.webhookUrls.length > 0) {
      const notifierLambda = new lambda.Function(this, 'Default', {
        handler: 'index.handler',
        code: lambda.Code.inline(fs.readFileSync(path.join(__dirname, 'notifier-handler.js')).toString('utf8')),
        runtime: lambda.Runtime.NODEJS_10_X,
        environment: {
          WEBHOOK_URLS: props.webhookUrls.join('|'),
        },
        timeout: Duration.minutes(5),
      });

      notifierLambda.role!.addToPolicy(new iam.PolicyStatement({
        actions: ['codepipeline:GetPipelineExecution'],
        resources: [props.pipeline.pipelineArn],
      }));

      props.pipeline.onStateChange('ChimeOnFailure', {
        target: new events_targets.LambdaFunction(notifierLambda),
        eventPattern: {
          detail: {
            state: 'FAILED',
          }
        },
      });
    }
  }
}