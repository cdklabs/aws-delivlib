import { expect as assert, haveResource } from '@aws-cdk/assert';
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { Shellable } from '../lib';

// tslint:disable:max-line-length

test('minimal configuration', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh'
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project'));
});

test('assume role', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name'
    }
  });

  const template = stack.toCloudFormation();
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
});

test('assume role with external-id', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
      externalId: 'my-externa-id',
    }
  });

  const template = stack.toCloudFormation();
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\" --external-id \"my-externa-id\" > $creds');
});
