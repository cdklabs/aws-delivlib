import * as crypto from 'crypto';
import {
  aws_chatbot as chatbot,
  aws_codestarnotifications as starnotifs,
} from 'monocdk';
import { IPipelineNotification, PipelineNotificationBindOptions } from '../';

/**
 * Properties to initialize SlackNotification
 */
export interface SlackNotificationProps {
  /**
   * The list of Chatbot registered slack channels.
   */
  readonly channels: chatbot.SlackChannelConfiguration[];

  /**
   * The level of details to be included in the notification
   * @default SlackNotificationDetailLevel.BASIC
   */
  readonly detailLevel?: SlackNotificationDetailLevel;
}

/**
 * The level of details to be included in a slack notification.
 */
export enum SlackNotificationDetailLevel {
  /**
   * Basic event details without the contents of the error message.
   */
  BASIC = 'BASIC',
  /**
   * Information included in BASIC, plus the contents of the error message.
   */
  FULL = 'FULL',
}

/**
 * Notify events on pipeline to a Slack channel via AWS Chatbot
 */
export class SlackNotification implements IPipelineNotification {
  constructor(private readonly props: SlackNotificationProps) {
    if (this.props.channels.length == 0) {
      throw new Error('channels cannot be empty');
    }
  }

  public bind(options: PipelineNotificationBindOptions): void {
    const targets: starnotifs.CfnNotificationRule.TargetProperty[] = this.props.channels.map(c => {
      return {
        targetAddress: c.slackChannelConfigurationArn,
        targetType: 'AWSChatbotSlack',
      };
    });
    const md5 = crypto.createHash('md5');
    md5.update(JSON.stringify(targets));
    const hash = md5.digest('hex');
    new starnotifs.CfnNotificationRule(options.pipeline, `PipelineNotificationSlack-${hash}`, {
      name: `${options.pipeline.pipeline.pipelineName}-${hash}`,
      detailType: this.props.detailLevel ?? SlackNotificationDetailLevel.BASIC,
      resource: options.pipeline.pipeline.pipelineArn,
      targets,
      eventTypeIds: ['codepipeline-pipeline-action-execution-failed'],
    });
  }
}