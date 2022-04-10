import * as cdk from 'monocdk';
import { TestStack } from './test-stack';


const stackName = process.env.TEST_STACK_NAME;
if (!stackName) {
  throw new Error('TEST_STACK_NAME must be defined');
}

const app = new cdk.App();
new TestStack(app, stackName);
app.synth();
