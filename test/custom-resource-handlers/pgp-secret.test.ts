import aws = require('aws-sdk');
import crypto = require('crypto');
import fs = require('fs');
import { createMockInstance } from 'jest-create-mock-instance';
import path = require('path');
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');
import lambda = require('../../custom-resource-handlers/src/_lambda');

const context: lambda.Context = { awsRequestId: 'E3802D69-27F8-44F0-9E4C-3329A8736A4C' } as any;
const mockTmpDir = '/tmp/directory/is/phony';
const mockPrivateKey = '---BEGIN RSA FAKE PRIVATE KEY---';
const mockPublicKey = '---BEGIN RSA FAKE PUBLIC KEY---';
const mockEventBase = {
  LogicalResourceId: 'ResourceID12345689',
  ResponseURL: 'https://response/url',
  RequestId: '5EF100FB-0075-4716-970B-FBCA05BFE118',
  ResourceProperties: {
    ServiceToken:     'Service-Token (Would be the function ARN',
    ResourceVersion:  'The hash of the function code',

    KeySizeBits:      4_096,
    Identity:         'Test Identity',
    Email:            'test@amazon.com',
    Expiry:           '1d',
    SecretName:       'Secret/Name/Shhhhh',
    KeyArn:           'alias/KmsKey',
    Description:      'Description',
  },
  ResourceType: 'Custom::Resource::Type',
  StackId: 'StackID-1324597',
};

const secretArn = 'arn::::::secret';

const passphrase = crypto.randomBytes(32);

const keyConfig = `Key-Type: RSA
Key-Length: ${mockEventBase.ResourceProperties.KeySizeBits}
Name-Real: ${mockEventBase.ResourceProperties.Identity}
Name-Email: ${mockEventBase.ResourceProperties.Email}
Expire-Date: ${mockEventBase.ResourceProperties.Expiry}
Passphrase: ${passphrase.toString('base64')}
%commit
%echo done`;

jest.spyOn(crypto, 'randomBytes').mockImplementation(() => passphrase);
jest.spyOn(fs, 'mkdtemp')
  .mockImplementation(async (_, cb) => cb(undefined as any, mockTmpDir));
const writeFile = fs.writeFile = jest.fn().mockName('fs.writeFile')
  .mockImplementation((_pth, _data, _opts, cb) => cb()) as any;
jest.mock('../../custom-resource-handlers/src/_exec', () => async (cmd: string, ...args: string[]) => {
  await expect(cmd).toBe('gpg');
  await expect(args).toContain('--batch');
  if (args.indexOf('--gen-key') !== -1) {
    await expect(args[args.indexOf('--gen-key') + 1]).toBe(require('path').join(mockTmpDir, 'key.config'));
    return '';
  }
  await expect(args).toContain('--yes');
  if (args.indexOf('--import') !== -1) {
    return '';
  }
  await expect(args).toContain('--armor');
  if (args.indexOf('--export') !== -1) {
    return mockPublicKey;
  } else if (args.indexOf('--export-secret-keys') !== -1) {
    return mockPrivateKey;
  }
  throw new Error(`Invalid call to _exec`);
});
const mockSecretsManager = createMockInstance(aws.SecretsManager);
aws.SecretsManager = jest.fn().mockName('SecretsManager')
  .mockImplementation(() => mockSecretsManager) as any;
const mockSendResponse = jest.spyOn(cfn, 'sendResponse').mockName('cfn.sendResponse').mockResolvedValue(Promise.resolve({}));
const mockRmrf = jest.fn().mockName('_rmrf').mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);

test('Create', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.CREATE,
    PhysicalResourceId: undefined,
    ...mockEventBase
  };

  mockSecretsManager.createSecret = jest.fn().mockName('SecretsManager.createSecret')
    .mockImplementation(() => ({ promise: () => Promise.resolve({ ARN: secretArn, VersionId: 'Secret-VersionId'}) })) as any;

  const { handler } = require('../../custom-resource-handlers/src/pgp-secret');
  await expect(handler(event, context)).resolves.toBe(undefined);

  await expect(writeFile)
    .toBeCalledWith(path.join(mockTmpDir, 'key.config'),
                    keyConfig,
                    expect.anything(),
                    expect.any(Function));
  await expect(mockRmrf)
    .toBeCalledWith(mockTmpDir);
  await expect(mockSecretsManager.createSecret)
    .toBeCalledWith({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KeyArn,
      Name: event.ResourceProperties.SecretName,
      SecretString: JSON.stringify({
        PrivateKey: mockPrivateKey,
        Passphrase: passphrase.toString('base64')
      }),
    });
  return expect(mockSendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    secretArn,
                    {
                      Ref: secretArn,
                      SecretArn: secretArn,
                      PublicKey: mockPublicKey,
                    });
});

test('Update', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: secretArn,
    OldResourceProperties: {
      ...mockEventBase.ResourceProperties,
      Description: 'Old Description',
      KeyArn: 'alias/OldKey',
    },
    ...mockEventBase,
  };

  mockSecretsManager.updateSecret = jest.fn().mockName('SecretsManager.updateSecret')
    .mockImplementation(() => ({ promise: () => Promise.resolve({ ARN: secretArn }) })) as any;
  mockSecretsManager.getSecretValue = jest.fn().mockName('SecretsManager.getSecretValue')
    .mockImplementation(() => ({ promise: () => Promise.resolve({ SecretString: JSON.stringify({
      PrivateKey: mockPrivateKey,
      Passphrase: passphrase.toString('base64')
    }) }) })) as any;

  const { handler } = require('../../custom-resource-handlers/src/pgp-secret');
  await expect(handler(event, context)).resolves.toBe(undefined);
  await expect(mockSecretsManager.updateSecret)
    .toBeCalledWith({
      ClientRequestToken: context.awsRequestId,
      SecretId: secretArn,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KeyArn
    });
  await expect(mockSecretsManager.getSecretValue)
    .toBeCalledWith({ SecretId: secretArn });
  await expect(mockRmrf)
    .toBeCalledWith(mockTmpDir);
  return expect(mockSendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    secretArn,
                    {
                      Ref: secretArn,
                      SecretArn: secretArn,
                      PublicKey: mockPublicKey,
                    });
});

test('Delete', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.DELETE,
    PhysicalResourceId: secretArn,
    ...mockEventBase
  };

  const { handler } = require('../../custom-resource-handlers/src/pgp-secret');
  await expect(handler(event, context)).resolves.toBe(undefined);
  return expect(mockSendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    event.PhysicalResourceId,
                    { Ref: event.PhysicalResourceId });
});
