import cdk = require('@aws-cdk/core');
import { TestStack } from './test-stack';

const stackName = process.env.TEST_STACK_NAME;
if (!stackName) {
  throw new Error(`TEST_STACK_NAME must be defined`);
}

const app = new cdk.App();
new TestStack(app, stackName, {
  env: { region: 'us-east-1', account: '712950704752' }
});
app.synth();
