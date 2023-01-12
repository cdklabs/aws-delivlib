import { ChimeNotification, ChimeNotificationProps } from './chime';
import { SlackNotification, SlackNotificationProps } from './slack';
import { IPipelineNotification } from '../pipeline';

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