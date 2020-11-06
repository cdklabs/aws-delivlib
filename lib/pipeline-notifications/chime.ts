import * as crypto from 'crypto';
import { ChimeNotifier, ChimeNotifierOptions, IPipelineNotification, PipelineNotificationBindOptions } from '../';

/**
 * Properties to initialize ChimeNotification
 */
export interface ChimeNotificationProps extends ChimeNotifierOptions {
}

/**
 * Notify events on pipeline to a Chime room.
 */
export class ChimeNotification implements IPipelineNotification {
  constructor(private readonly props: ChimeNotificationProps) {
  }

  public bind(options: PipelineNotificationBindOptions): void {
    const md5 = crypto.createHash('md5');
    md5.update(JSON.stringify(this.props.webhookUrls));
    new ChimeNotifier(options.pipeline, `PipelineNotificationChime-${md5.digest('hex')}`, {
      ...this.props,
      pipeline: options.pipeline.pipeline,
    });
  }
}