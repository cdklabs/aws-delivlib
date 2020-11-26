//
// This app manages the delivery pipeline for aws-delivlib itself. Very meta.
//
// To update the pipeline, you'll need AWS credentials for this account and
// then run:
//
//     npm run pipeline-update
//
import {
  App, Aspects, IAspect, IConstruct, Stack, StackProps, Token,
  aws_codebuild as codebuild,
  aws_iam as iam,
  aws_ecr as ecr,
  aws_secretsmanager as secret,
} from 'monocdk';
import * as delivlib from '../lib';

export const DOCKERHUB_SUPERCHAIN = 'jsii/superchain:latest';

export class DelivLibPipelineStack extends Stack {
  constructor(parent: App, id: string, props: StackProps = { }) {
    super(parent, id, props);

    const github = new delivlib.WritableGitHubRepo({
      repository: 'awslabs/aws-delivlib',
      tokenSecretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:github-token-nnAqfW',
      commitEmail: 'aws-cdk-dev+delivlib@amazon.com',
      commitUsername: 'aws-cdk-dev',
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:awslabs/delivlib/github-ssh-UBHEyF' },
    });

    const pipeline = new delivlib.Pipeline(this, 'GitHubPipeline', {
      title: 'aws-delivlib production pipeline',
      repo: github,
      branch: 'main',
      pipelineName: 'delivlib-main',
      notificationEmail: 'aws-cdk-dev+delivlib-notify@amazon.com',
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: ['yarn install --frozen-lockfile'],
          },
          build: {
            commands: [
              'yarn build',
              'yarn test',
            ],
          },
          post_build: {
            commands: ['[ ${CODEBUILD_BUILD_SUCCEEDING:-1} != 1 ] || npm run package'],
          },
        },
        artifacts: {
          'files': ['**/*'],
          'base-directory': 'dist',
        },
      }),
      autoBuild: true,
      autoBuildOptions: { publicLogs: true },
    });

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-OynG62' },
    });

    pipeline.autoBump({
      scheduleExpression: 'cron(0 12 * * ? *)',
      bumpCommand: 'yarn install --frozen-lockfile && yarn bump',
      base: {
        name: 'main',
      },
      head: {
        name: 'main',
      },
      pushOnly: true,
    });
  }
}

export class EcrMirrorStack extends Stack {
  public readonly superchainRepo: ecr.IRepository;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const superchainSource = delivlib.MirrorSource.fromDockerHub(DOCKERHUB_SUPERCHAIN);

    const ecrMirror = new delivlib.EcrMirror(this, 'Default', {
      dockerHubCreds: {
        secret: secret.Secret.fromSecretArn(this, 'DockerHubCreds', 'arn:aws:secretsmanager:us-east-1:712950704752:secret:dockerhub/ReadOnly-VXZo5Z'),
        usernameKey: 'username',
        passwordKey: 'password',
      },
      images: [
        superchainSource,
      ],
    });

    const repo = ecrMirror.ecrRepository(superchainSource);
    if (!repo) {
      throw new Error('Cannot find ECR mirror repository for "jsii/superchain"');
    }
    this.superchainRepo = repo;
  }
}

export class EcrMirrorAspect implements IAspect {
  constructor(private readonly superchainRepo: ecr.IRepository) {}

  public visit(construct: IConstruct) {
    if (construct instanceof codebuild.Project) {
      const cfnproject = construct.node.defaultChild as codebuild.CfnProject;
      if (!Token.isUnresolved(cfnproject.environment)) {
        const env = cfnproject.environment as codebuild.CfnProject.EnvironmentProperty;
        if (env.image === 'jsii/superchain' || env.image === 'jsii/superchain:latest') {
          cfnproject.environment = {
            ...env,
            image: codebuild.LinuxBuildImage.fromEcrRepository(this.superchainRepo).imageId,
          };
          this.superchainRepo.grantPull(construct);
          construct.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
          }));
        }
      }
    }
  }
}

const app = new App();

// this pipeline is mastered in a specific account where all the secrets are stored
const ecrMirrorStack = new EcrMirrorStack(app, 'aws-delivlib-ecr-mirror', {
  env: { region: 'us-east-1', account: '712950704752' },
});
const pipelineStack = new DelivLibPipelineStack(app, 'aws-delivlib-pipeline', {
  env: { region: 'us-east-1', account: '712950704752' },
});
Aspects.of(pipelineStack).add(new EcrMirrorAspect(ecrMirrorStack.superchainRepo));

app.synth();
