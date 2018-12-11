import cdk = require('@aws-cdk/cdk');
import { TestStack } from './test-stack';

const app = new cdk.App();
new TestStack(app, 'delivlib-test');
app.run();
