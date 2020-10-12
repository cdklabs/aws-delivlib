import {
  aws_codepipeline as cpipeline,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_events as events,
  aws_events_targets as events_targets,
} from "monocdk-experiment";
import * as cdk from 'monocdk-experiment';
import fs = require("fs");
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
   * The message to send to the channels.
   *
   * Can use the following placeholders:
   *
   * - $PIPELINE: the name of the pipeline
   * - $REVISION: description of the failing revision
   * - $ACTION: name of failing action
   * - $URL: link to failing action details
   *
   * @default - A default message
   */
  readonly message?: string;

  /**
   * Code Pipeline to listen to
   */
  readonly pipeline: cpipeline.IPipeline;
}

/**
 * Send a message to a Chime room when a pipeline fails
 */
export class ChimeNotifier extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ChimeNotifierProps) {
    super(scope, id);

    const message = props.message ?? "/md @All Pipeline **$PIPELINE** failed in action **$ACTION**. Latest change:\n```\n$REVISION\n```\n([Failure details]($URL))";

    if (props.webhookUrls.length > 0) {
      // Reuse the same Lambda code for all pipelines, we will move the Lambda parameterizations into
      // the CloudWatch Event Input.
      const notifierLambda = new lambda.SingletonFunction(this, 'Default', {
        handler: 'index.handler',
        uuid: '0f4a3ee0-692e-4249-932f-a46a833886d8',
        code: lambda.Code.inline(stripComments(fs.readFileSync(path.join(__dirname, 'notifier-handler.js')).toString('utf8'))),
        runtime: lambda.Runtime.NODEJS_10_X,
        timeout: cdk.Duration.minutes(5),
      });

      notifierLambda.addToRolePolicy(new iam.PolicyStatement({
        actions: ['codepipeline:GetPipelineExecution', 'codepipeline:ListActionExecutions'],
        resources: [props.pipeline.pipelineArn],
      }));

      props.pipeline.onStateChange('ChimeOnFailure', {
        target: new events_targets.LambdaFunction(notifierLambda, {
          event: events.RuleTargetInput.fromObject({
            // Add parameters
            message,
            webhookUrls: props.webhookUrls,
            // Copy over "detail" field
            detail: events.EventField.fromPath('$.detail'),
          })
        }),
        eventPattern: {
          detail: {
            state: ['FAILED'],
          }
        },
      });
    }
  }
}

/**
 * Strip comments from JS source code to keep its size small enough for inline code.
 *
 * At least get rid of the giant TypeScript source map.
 */
function stripComments(x: string) {
  return x.replace(/\/\/.*$/g, '').replace(/\/\*.*\*\//gs, '');
}
