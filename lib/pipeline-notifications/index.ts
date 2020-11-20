import { IPipelineNotification } from '../pipeline';
import { ChimeNotification, ChimeNotificationProps } from './chime';
import { SlackNotification, SlackNotificationProps } from './slack';

export class PipelineNotification {
  public static slack(props: SlackNotificationProps): IPipelineNotification {
    return new SlackNotification(props);
  }

  public static chime(props: ChimeNotificationProps): IPipelineNotification {
    return new ChimeNotification(props);
  }
}

export * from './chime';
export * from './slack';