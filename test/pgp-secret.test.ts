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

test('Handler has appropriate permissions', () => {
  // GIVEN
  const stack = new cdk.Stack(undefined, 'TestStack');

  // WHEN
  new PGPSecret(stack, 'Secret', {
    pubKeyParameterName: '/Foo',
    email: 'nobody@nowhere.com',
    encryptionKey: new kms.EncryptionKey(stack, 'CMK'),
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    secretName: 'Bar',
    version: 0,
  });

  // THEN
  assert.expect(stack).to(assert.haveResource('AWS::IAM::Policy', {
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:UpdateSecret",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
        ],
        Resource: '*'
      }, {
        Effect: 'Allow',
        Action: [
          'kms:GenerateDataKey',
          'kms:Encrypt',
          'kms:Decrypt',
        ],
        Resource: { 'Fn::GetAtt': ['CMK56817A4C', 'Arn'] }
      }]
    },
    PolicyName: 'SingletonLambdaf25803d3054b44fc985f4860d7d6ee74ServiceRoleDefaultPolicyA8FDF5BD',
    Roles: [{ Ref: 'SingletonLambdaf25803d3054b44fc985f4860d7d6ee74ServiceRole410148CF' }]
  }));
});
