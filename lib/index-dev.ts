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
const token = sm.Secret.fromSecretCompleteArn(stack, 'GitHubSecret', 'arn:aws:secretsmanager:us-east-1:185706627232:secret:github-token-0qcsIC');

new PackageIntegrityValidation(stack, 'cdk8s-team/cdk8s-plus-20', {
  repository: 'cdk8s-team/cdk8s-plus',
  tagPrefix: 'cdk8s-plus-20/',
  buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12'),
  githubTokenSecret: token,
  schedule: events.Schedule.rate(Duration.minutes(5)),
});

new PackageIntegrityValidation(stack, 'cdk8s-team/cdk8s-plus-21', {
  repository: 'cdk8s-team/cdk8s-plus',
  tagPrefix: 'cdk8s-plus-21/',
  buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12'),
  githubTokenSecret: token,
  schedule: events.Schedule.rate(Duration.minutes(5)),
});

new PackageIntegrityValidation(stack, 'cdk8s-team/cdk8s-plus-22', {
  repository: 'cdk8s-team/cdk8s-plus',
  tagPrefix: 'cdk8s-plus-22/',
  buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12'),
  githubTokenSecret: token,
  schedule: events.Schedule.rate(Duration.minutes(5)),
});
