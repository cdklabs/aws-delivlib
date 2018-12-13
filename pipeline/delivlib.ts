//
// This app manages the delivery pipeline for aws-delivlib itself. Very meta.
//
// To update the pipeline, you'll need AWS credentials for this account and
// then run:
//
//     npm run pipeline-update
//
import cdk = require('@aws-cdk/cdk');
import delivlib = require('../lib');

export class DelivLibPipelineStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props: cdk.StackProps = { }) {
    super(parent, id, props);

    const github = new delivlib.GitHubRepo({
      repository: 'awslabs/aws-delivlib',
      tokenParameterName: 'github-token'
    });

    const pipeline = new delivlib.Pipeline(this, 'GitHubPipeline', {
      title: 'aws-delivlib production pipeline',
      repo: github,
      concurrency: false, // temporary until we increase the account limits
      buildSpec: {
        version: '0.2',
        phases: {
          install: {
            commands: [ 'npm install' ]
          },
          build: {
            commands: [
              'npm run build',
              'npm test'
            ]
          },
          post_build: {
            commands: [ 'npm run package' ]
          }
        },
        artifacts: {
          'files': [ '**/*' ],
          'base-directory': 'dist'
        }
      }
    });

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-OynG62' }
    });
  }
}

const app = new cdk.App();

// this pipeline is mastered in a specific account where all the secrets are stored
new DelivLibPipelineStack(app, 'aws-delivlib-pipeline', {
  env: { region: 'us-east-1', account: '712950704752' }
});

app.run();
