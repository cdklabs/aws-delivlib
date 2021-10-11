import {
  App,
  Stack,
  aws_codebuild as codebuild,
  aws_secretsmanager as sm,
  aws_events as events,
  Duration,
} from 'monocdk';
import { PackageIntegrityValidation } from './package-integrity';

const app = new App();
const stack = new Stack(app, 'Integrity', { env: { account: '185706627232', region: 'us-east-1' } });

new PackageIntegrityValidation(stack, 'cdk8s-team/cdk8s-plus', {
  repository: 'cdk8s-team/cdk8s-plus',
  buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12'),
  githubTokenSecret: sm.Secret.fromSecretCompleteArn(stack, 'GitHubSecret', 'arn:aws:secretsmanager:us-east-1:185706627232:secret:github-token-0qcsIC'),
  schedule: events.Schedule.rate(Duration.minutes(5)),
});
