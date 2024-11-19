import {
  App, Stack,
  aws_codebuild as codebuild,
  aws_codecommit as codecommit,
  aws_kms as kms,
  assertions,
} from 'aws-cdk-lib';
import * as delivlib from '../../lib';

const { Template, Match } = assertions;


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
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'xyz',
      },
    });
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
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'xyz',
      },
    });
  });

  test('can control stage name', () => {
    pipeline.publishToNuGet({
      nugetApiKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/nuget-fHzSUD' },
      buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('xyz'),
      stageName: 'MyPublishStage',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([{
        Name: 'MyPublishStage',
        Actions: [Match.objectLike({
          Name: 'NuGetPublish',
        })],
      }]),
    });
  });

  test.each(['npm', 'nuget', 'maven', 'pypi'] as const)('publishing SSM timestamps adds IAM permissions: %p', (type) => {
    switch (type) {
      case 'npm':
        pipeline.publishToNpm({
          npmTokenSecret: { secretArn: 'arn:secret' },
          ssmPrefix: '/published/jsii-sample/npm',
        });
        break;

      case 'nuget':
        pipeline.publishToNuGet({
          nugetApiKeySecret: { secretArn: 'arn:secret' },
          ssmPrefix: '/published/jsii-sample/nuget',
        });
        break;

      case 'maven':
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
          mavenLoginSecret: { secretArn: 'arn:secret' },
          mavenEndpoint: 'https://aws.oss.sonatype.org:443/',
          stagingProfileId: '68a05363083174',
          ssmPrefix: '/published/jsii-sample/maven',
          signingKey,
        });
        break;

      case 'pypi':
        pipeline.publishToPyPI({
          loginSecret: { secretArn: 'arn:secret' },
          ssmPrefix: '/published/jsii-sample/pypi',
        });
        break;
    }

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([{
          Effect: 'Allow',
          Action: ['ssm:PutParameter', 'ssm:GetParameter'],
          Resource: { 'Fn::Join': ['', [
            "arn:",
            { "Ref": "AWS::Partition" },
            ":ssm:",
            { "Ref": "AWS::Region" },
            ":",
            { "Ref": "AWS::AccountId" },
            `:parameter/published/jsii-sample/${type}/*`,
          ]] },
        }]),
      },
    });
  });
});
