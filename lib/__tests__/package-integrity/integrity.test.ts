import { SynthUtils } from '@monocdk-experiment/assert';
import '@monocdk-experiment/assert/jest';
import {
  App, Stack,
  aws_codebuild as codebuild,
  aws_secretsmanager as sm,
} from 'monocdk';
import { PackageIntegrityValidation } from '../..';

test('minimal snapshot', () => {

  const stack = new Stack(new App(), 'TestStack');

  const token = sm.Secret.fromSecretCompleteArn(stack, 'GitHubSecret', 'arn:aws:secretsmanager:us-east-1:123456789123:secret:github-token-000000');

  new PackageIntegrityValidation(stack, 'Integrity', {
    buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12'),
    githubTokenSecret: token,
    repository: 'cdklabs/some-repo',
  });

  expect(SynthUtils.synthesize(stack).template).toMatchSnapshot();
});
