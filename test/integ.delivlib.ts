import cdk = require('@aws-cdk/cdk');
// import os = require('os');
import { TestStack } from './test-stack';

const app = new cdk.App();
// new TestStack(app, `delivlib-test-${os.userInfo().username}`);
new TestStack(app, `delivlib-test-3`);
app.run();
