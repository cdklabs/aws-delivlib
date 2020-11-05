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
    new ChimeNotifier(options.pipeline, 'PipelineNotificationChime', {
      ...this.props,
      pipeline: options.codePipeline,
    });
  }
}