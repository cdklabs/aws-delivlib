import assert = require('@aws-cdk/assert');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/cdk');
import { OpenPGPKeyPair } from '../lib/open-pgp-key-pair';

test('correctly creates', () => {
  // GIVEN
  const stack = new cdk.Stack(undefined, 'TestStack');
  const encryptionKey = new kms.EncryptionKey(stack, 'CMK');
  // WHEN
  new OpenPGPKeyPair(stack, 'Secret', {
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
    Identity: 'Test',
    Email: 'nobody@nowhere.com',
    Expiry: '1d',
    KeySizeBits: 1024,
    SecretName: 'SecretName',
    KeyArn: stack.node.resolve(encryptionKey.keyArn),
    Version: 0
  }));
});

test('correctly forwards parameter name', () => {
  // GIVEN
  const stack = new cdk.Stack(undefined, 'TestStack');
  const parameterName = 'TestParameterName';

  // WHEN
  new OpenPGPKeyPair(stack, 'Secret', {
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
  new OpenPGPKeyPair(stack, 'Secret', {
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
          'secretsmanager:CreateSecret',
          'secretsmanager:DeleteSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:UpdateSecret',
        ],
        Resource: {
          'Fn::Join': ['',
            ['arn:', { Ref: 'AWS::Partition' }, ':secretsmanager:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':secret:Bar-??????']
          ]
        }
      }, {
        Effect: 'Allow',
        Action: [
          'ssm:PutParameter',
          'ssm:DeleteParameter'
        ],
        Resource: {
          'Fn::Join': ['',
            ['arn:', { Ref: 'AWS::Partition' }, ':ssm:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':parameter/Foo']
          ]
        }
      }]
    },
    PolicyName: 'SingletonLambdaf25803d3054b44fc985f4860d7d6ee74ServiceRoleDefaultPolicyA8FDF5BD',
    Roles: [{ Ref: 'SingletonLambdaf25803d3054b44fc985f4860d7d6ee74ServiceRole410148CF' }]
  }));

  assert.expect(stack).to(assert.haveResourceLike('AWS::KMS::Key', {
    KeyPolicy: {
      Statement: [{
        // The key administration enabler statement -- exact content is irrelevant
        Resource: '*',
      }, {
        Effect: 'Allow',
        Action: ['kms:Decrypt', 'kms:GenerateDataKey'],
        Resource: '*',
        Condition: {
          StringEquals: { 'kms:ViaService': { 'Fn::Join': ['', ['secretsmanager.', { Ref: 'AWS::Region' }, '.amazonaws.com']] } }
        },
        Principal: { AWS: { 'Fn::GetAtt': ['SingletonLambdaf25803d3054b44fc985f4860d7d6ee74ServiceRole410148CF', 'Arn'] } },
      }]
    }
  }));
});
