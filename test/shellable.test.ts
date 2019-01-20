import { expect, haveResource } from '@aws-cdk/assert';
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { Shellable } from '../lib';

test('minimal configuration', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh'
  });

  expect(stack).to(haveResource('AWS::CodeBuild::Project'));
});