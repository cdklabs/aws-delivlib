import assert = require('@aws-cdk/assert');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/cdk');
import { PGPSecret } from '../lib/pgp-secret';

test('correctly creates', () => {
  // GIVEN
  const stack = new cdk.Stack(undefined, 'TestStack');
  const encryptionKey = new kms.EncryptionKey(stack, 'CMK');
  // WHEN
  new PGPSecret(stack, 'Secret', {
    email: 'nobody@nowhere.com',
    encryptionKey,
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    pubKeyParameterName: 'TestParameter',
    secretName: 'SecretName',
    version: 0
  });

  // THEN
  assert.expect(stack).to(assert.haveResourceLike('AWS::CloudFormation::CustomResource', {
    Identity: "Test",
    Email: "nobody@nowhere.com",
    Expiry: "1d",
    KeySizeBits: 1024,
    SecretName: "SecretName",
    KeyArn: stack.node.resolve(encryptionKey.keyArn),
    Version: 0
  }));
});

test('correctly forwards parameter name', () => {
  // GIVEN
  const stack = new cdk.Stack(undefined, 'TestStack');
  const parameterName = 'TestParameterName';

  // WHEN
  new PGPSecret(stack, 'Secret', {
    pubKeyParameterName: parameterName,
    email: 'nobody@nowhere.com',
    encryptionKey: new kms.EncryptionKey(stack, 'CMK'),
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    secretName: 'SecretName',
    version: 0
  });

  // THEN
  assert.expect(stack).to(assert.haveResource('AWS::SSM::Parameter', {
    Type: 'String',
    Value: { 'Fn::GetAtt': ['SecretA720EF05', 'PublicKey'] },
    Name: parameterName,
  }));
});
