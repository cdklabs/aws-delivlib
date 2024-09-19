import {
  App, Stack,
  aws_kms as kms,
} from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { OpenPGPKeyPair } from '../../lib/open-pgp-key-pair';


test('correctly creates', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');
  const encryptionKey = new kms.Key(stack, 'CMK');
  // WHEN
  new OpenPGPKeyPair(stack, 'Secret', {
    email: 'nobody@nowhere.com',
    encryptionKey,
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    pubKeyParameterName: 'TestParameter',
    secretName: 'SecretName',
    version: 0,
  });
  const template = Template.fromStack(stack);

  // THEN
  template.hasResourceProperties('AWS::CloudFormation::CustomResource', Match.objectLike({
    Identity: 'Test',
    Email: 'nobody@nowhere.com',
    Expiry: '1d',
    KeySizeBits: 1024,
    SecretName: 'SecretName',
    KeyArn: stack.resolve(encryptionKey.keyArn),
    Version: 0,
    DeleteImmediately: false,
  }));
});

test('correctly forwards parameter name', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');
  const parameterName = 'TestParameterName';

  // WHEN
  new OpenPGPKeyPair(stack, 'Secret', {
    pubKeyParameterName: parameterName,
    email: 'nobody@nowhere.com',
    encryptionKey: new kms.Key(stack, 'CMK'),
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    secretName: 'SecretName',
    version: 0,
  });
  const template = Template.fromStack(stack);

  // THEN
  template.hasResourceProperties('AWS::SSM::Parameter', {
    Type: 'String',
    Value: { 'Fn::GetAtt': ['SecretResourceV2A1B4436D', 'PublicKey'] },
    Name: parameterName,
  });
});

test('Handler has appropriate permissions', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');

  // WHEN
  new OpenPGPKeyPair(stack, 'Secret', {
    pubKeyParameterName: '/Foo',
    email: 'nobody@nowhere.com',
    encryptionKey: new kms.Key(stack, 'CMK'),
    expiry: '1d',
    identity: 'Test',
    keySizeBits: 1_024,
    secretName: 'Bar',
    version: 0,
  });
  const template = Template.fromStack(stack);

  // THEN
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: [
          'secretsmanager:CreateSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:UpdateSecret',
          'secretsmanager:DeleteSecret',
        ],
        Resource: {
          'Fn::Join': ['',
            ['arn:', { Ref: 'AWS::Partition' }, ':secretsmanager:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':secret:Bar-??????']],
        },
      }, {
        Effect: 'Allow',
        Action: 'ssm:DeleteParameter',
        Resource: '*',
      }],
    },
    PolicyName: 'SingletonLambda2422BDC2DBB047C1B7015599E0849C54ServiceRoleDefaultPolicyAD608560',
    Roles: [{ Ref: 'SingletonLambda2422BDC2DBB047C1B7015599E0849C54ServiceRole3FA81C88' }],
  });

  template.hasResourceProperties('AWS::KMS::Key', {
    KeyPolicy: {
      Statement: Match.arrayWith([Match.objectLike({
        // The key administration enabler statement -- exact content is irrelevant
        Resource: '*',
      }), Match.objectLike({
        Effect: 'Allow',
        Action: ['kms:Decrypt', 'kms:GenerateDataKey'],
        Resource: '*',
        Condition: {
          StringEquals: { 'kms:ViaService': { 'Fn::Join': ['', ['secretsmanager.', { Ref: 'AWS::Region' }, '.amazonaws.com']] } },
        },
        Principal: { AWS: { 'Fn::GetAtt': ['SingletonLambda2422BDC2DBB047C1B7015599E0849C54ServiceRole3FA81C88', 'Arn'] } },
      })]),
    },
  });
});
