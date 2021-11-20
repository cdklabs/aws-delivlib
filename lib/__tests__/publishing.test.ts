import { expect as cdk_expect, haveResourceLike } from '@monocdk-experiment/assert';
import {
  App, Stack,
  aws_codebuild as codebuild,
  aws_codecommit as codecommit,
  aws_kms as kms,
} from 'monocdk';
import * as delivlib from '../../lib';


describe('with standard pipeline', () => {
  let stack: Stack;
  let pipeline: delivlib.Pipeline;
  beforeEach(() => {
    stack = new Stack(new App(), 'TestStack');

    pipeline = new delivlib.Pipeline(stack, 'Pipeline', {
      repo: new delivlib.CodeCommitRepo(new codecommit.Repository(stack, 'Repo', { repositoryName: 'test' })),
      pipelineName: 'HelloPipeline',
    });
  });

  test('can configure build image for NuGet publishing', () => {
    pipeline.publishToNuGet({
      nugetApiKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/nuget-fHzSUD' },
      buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('xyz'),
    });

    cdk_expect(stack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'xyz',
      },
    }));
  });

  test('can configure build image for Maven publishing', () => {
    const signingKey = new delivlib.OpenPGPKeyPair(stack, 'CodeSign', {
      email: 'aws-cdk-dev+delivlib@amazon.com',
      encryptionKey: new kms.Key(stack, 'CodeSign-CMK'),
      expiry: '4y',
      identity: 'aws-cdk-dev',
      keySizeBits: 4_096,
      pubKeyParameterName: `/${stack.node.path}/CodeSign.pub`,
      secretName: stack.node.path + '/CodeSign',
      version: 0,
      removalPolicy: delivlib.OpenPGPKeyPairRemovalPolicy.DESTROY_IMMEDIATELY,
    });

    pipeline.publishToMaven({
      mavenLoginSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/maven-7ROCWi' },
      mavenEndpoint: 'https://aws.oss.sonatype.org:443/',
      signingKey,
      stagingProfileId: '68a05363083174',
      buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('xyz'),
    });

    cdk_expect(stack).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'xyz',
      },
    }));
  });
});
