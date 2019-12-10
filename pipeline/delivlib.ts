//
// This app manages the delivery pipeline for aws-delivlib itself. Very meta.
//
// To update the pipeline, you'll need AWS credentials for this account and
// then run:
//
//     npm run pipeline-update
//
import codebuild = require('@aws-cdk/aws-codebuild');
import cdk = require('@aws-cdk/core');
import delivlib = require('../lib');

export class DelivLibPipelineStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props: cdk.StackProps = { }) {
    super(parent, id, props);

    const github = new delivlib.WritableGitHubRepo({
      repository: 'awslabs/aws-delivlib',
      token: cdk.SecretValue.secretsManager('github-token'),
      commitEmail: 'aws-cdk-dev+delivlib@amazon.com',
      commitUsername: 'aws-cdk-dev',
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/github-ssh-lwzfjW' }
    });

    const pipeline = new delivlib.Pipeline(this, 'GitHubPipeline', {
      title: 'aws-delivlib production pipeline',
      repo: github,
      pipelineName: 'delivlib-master',
      notificationEmail: 'aws-cdk-dev+delivlib-notify@amazon.com',
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [ 'npm ci' ]
          },
          build: {
            commands: [
              'npm run build',
              'npm test'
            ]
          },
          post_build: {
            commands: [ '[ ${CODEBUILD_BUILD_SUCCEEDING:-1} != 1 ] || npm run package' ]
          }
        },
        artifacts: {
          'files': [ '**/*' ],
          'base-directory': 'dist'
        }
      }),
      autoBuild: true,
      autoBuildOptions: { publicLogs: true }
    });

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-OynG62' }
    });

    pipeline.autoBump({
      bumpCommand: 'npm i && npm run bump',
      branch: 'master'
    });
  }
}

const app = new cdk.App();

// this pipeline is mastered in a specific account where all the secrets are stored
new DelivLibPipelineStack(app, 'aws-delivlib-pipeline', {
  env: { region: 'us-east-1', account: '712950704752' }
});

app.synth();
