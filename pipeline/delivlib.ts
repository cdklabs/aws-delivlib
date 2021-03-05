//
// This app manages the delivery pipeline for aws-delivlib itself. Very meta.
//
// To update the pipeline, you'll need AWS credentials for this account and
// then run:
//
//     npm run pipeline-update
//
import { aws_codebuild as codebuild, aws_ssm as ssm } from "monocdk";
import * as cdk from 'monocdk';
import delivlib = require("../lib");


export class DelivLibPipelineStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props: cdk.StackProps = { }) {
    super(parent, id, props);

    const github = new delivlib.WritableGitHubRepo({
      repository: 'awslabs/aws-delivlib',
      tokenSecretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:github-token-nnAqfW',
      commitEmail: 'aws-cdk-dev+delivlib@amazon.com',
      commitUsername: 'aws-cdk-dev',
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:awslabs/delivlib/github-ssh-UBHEyF' }
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
            commands: [ 'yarn install --frozen-lockfile' ]
          },
          build: {
            commands: [
              'yarn build',
              'yarn test'
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
      autoBuildOptions: { publicLogs: true },

      // We can't put the list of webhook URLs directly in here since this repository is open source and
      // the list of URLs would be enough to spam us. Import from an SSM parameter.
      chimeFailureWebhooks: [ssm.StringParameter.fromStringParameterName(this, 'WebhookList', 'BuildWebhook').stringValue],
    });

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-OynG62' }
    });

    pipeline.autoBump({
      scheduleExpression: 'cron(0 12 * * ? *)',
      bumpCommand: 'yarn install --frozen-lockfile && yarn bump',
      head: {
        name: 'master'
      },
      pushOnly: true
    });
  }
}

const app = new cdk.App();

// this pipeline is mastered in a specific account where all the secrets are stored
new DelivLibPipelineStack(app, 'aws-delivlib-pipeline', {
  env: { region: 'us-east-1', account: '712950704752' }
});

app.synth();
