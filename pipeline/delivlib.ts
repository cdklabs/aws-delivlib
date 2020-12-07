//
// This app manages the delivery pipeline for aws-delivlib itself. Very meta.
//
// To update the pipeline, you'll need AWS credentials for this account and
// then run:
//
//     npm run pipeline-update
//
import {
  App, Aspects, Stack, StackProps,
  aws_codebuild as codebuild,
  aws_secretsmanager as secret,
} from 'monocdk';
import * as delivlib from '../lib';

const SUPERCHAIN = 'jsii/superchain';

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
  public readonly mirror: delivlib.EcrMirror;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const superchainSource = delivlib.MirrorSource.fromDockerHub(SUPERCHAIN);

    this.mirror = new delivlib.EcrMirror(this, 'Default', {
      dockerHubCredentials: {
        secret: secret.Secret.fromSecretArn(this, 'DockerHubCreds', 'arn:aws:secretsmanager:us-east-1:712950704752:secret:dockerhub/ReadOnly-VXZo5Z'),
        usernameKey: 'username',
        passwordKey: 'password',
      },
      sources: [
        superchainSource,
      ],
    });
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
Aspects.of(pipelineStack).add(new delivlib.EcrMirrorAspect(ecrMirrorStack.mirror));

app.synth();
