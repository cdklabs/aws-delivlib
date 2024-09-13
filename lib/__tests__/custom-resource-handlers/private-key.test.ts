/* eslint-disable @typescript-eslint/no-require-imports */
import fs = require('fs');
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');
import lambda = require('../../custom-resource-handlers/src/_lambda');

const context: lambda.Context = { awsRequestId: '90E99AAE-B120-409A-9156-0C5925FDD996' } as lambda.Context;
const mockKeySize = 4_096;
const eventBase = {
  LogicalResourceId: 'ResourceID12345689',
  ResponseURL: 'https://response/url',
  RequestId: '5EF100FB-0075-4716-970B-FBCA05BFE118',
  ResourceProperties: {
    ServiceToken: 'Service-Token (Would be the function ARN',
    ResourceVersion: 'The hash of the function code',

    Description: 'Description of my secret',
    KeySize: 4_096,
    KmsKeyId: 'alias/KmsKey',
    SecretName: 'Sekret/Name/Shhhh',
  },
  ResourceType: 'Custom::Resource::Type',
  StackId: 'StackID-1324597',
};
const mockTmpDir = '/tmp/directory/is/phony';
const mockPrivateKey = 'Phony PEM-Encoded Private Key';
const secretArn = 'arn::::::secret';

cfn.sendResponse = jest.fn().mockName('cfn.sendResponse').mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_exec', () => async (cmd: string, ...args: string[]) => {
  expect(cmd).toBe('openssl');
  expect(args).toEqual(['genrsa', '-out', require('path').join(mockTmpDir, 'private_key.pem'), mockKeySize]);
  return '';
});
jest.spyOn(fs, 'mkdtemp').mockName('fs.mkdtemp')
  .mockImplementation(async (_, cb) => cb(undefined as any, mockTmpDir));
fs.readFile = jest.fn().mockName('fs.readFile')
  .mockImplementation(async (file, opts, cb) => {
    expect(file).toBe(require('path').join(mockTmpDir, 'private_key.pem'));
    expect(opts.encoding).toBe('utf8');
    return cb(undefined, mockPrivateKey);
  }) as any;
const mockRmrf = jest.fn().mockName('_rmrf').mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);

beforeEach(() => jest.clearAllMocks());

const mockSecretsManagerClient = {
  createSecret: jest.fn().mockName('SecretsManager.createSecret'),
  updateSecret: jest.fn().mockName('SecretsManager.updateSecret'),
  deleteSecret: jest.fn().mockName('SecretsManager.deleteSecret'),
};

jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManager: jest.fn().mockImplementation(() => {
      return mockSecretsManagerClient;
    }),
  };
});

beforeEach(() => {
  mockSecretsManagerClient.createSecret.mockImplementation(() => Promise.resolve({ ARN: secretArn, VersionId: 'Secret-VersionID' }));
  mockSecretsManagerClient.updateSecret.mockImplementation(() => Promise.resolve({ ARN: secretArn }));
  mockSecretsManagerClient.deleteSecret.mockImplementation(() => Promise.resolve({}));
});

test('Create', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.CREATE,
    PhysicalResourceId: undefined,
    ...eventBase,
  };

  const { handler } = require('../../custom-resource-handlers/src/private-key');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockSecretsManagerClient.createSecret)
    .toHaveBeenCalledWith({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      Name: event.ResourceProperties.SecretName,
      SecretString: mockPrivateKey,
    });
  expect(mockSecretsManagerClient.updateSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.deleteSecret).not.toHaveBeenCalled();
  expect(mockRmrf).toHaveBeenCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      secretArn,
      { Ref: secretArn, SecretArn: secretArn });
});

test('Update (changing KeySize)', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: secretArn,
    OldResourceProperties: {
      ...eventBase.ResourceProperties,
      KeySize: mockKeySize * 2,
    },
    ...eventBase,
  };

  const { handler } = require('../../custom-resource-handlers/src/private-key');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockSecretsManagerClient.createSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.updateSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.deleteSecret).not.toHaveBeenCalled();
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.FAILED,
      secretArn,
      {},
      expect.stringContaining('The KeySize property cannot be updated'));
});

test('Update (changing SecretName)', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: secretArn,
    OldResourceProperties: {
      ...eventBase.ResourceProperties,
      SecretName: 'Old/Secret/Name',
    },
    ...eventBase,
  };

  const { handler } = require('../../custom-resource-handlers/src/private-key');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockSecretsManagerClient.createSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.updateSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.deleteSecret).not.toHaveBeenCalled();
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.FAILED,
      secretArn,
      {},
      expect.stringContaining('The SecretName property cannot be updated'));
});

test('Update (changing Description and KmsKeyId)', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: secretArn,
    OldResourceProperties: {
      ...eventBase.ResourceProperties,
      Description: 'Old description',
      KmsKeyId: 'alias/OldKmsKey',
    },
    ...eventBase,
  };

  const { handler } = require('../../custom-resource-handlers/src/private-key');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockSecretsManagerClient.createSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.updateSecret)
    .toHaveBeenCalledWith({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      SecretId: secretArn,
    });
  expect(mockSecretsManagerClient.deleteSecret).not.toHaveBeenCalled();
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      secretArn,
      { Ref: secretArn, SecretArn: secretArn });
});

test('Delete', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.DELETE,
    PhysicalResourceId: secretArn,
    ...eventBase,
  };

  jest.spyOn(cfn, 'customResourceHandler').mockName('cfn.customResourceHandler')
    .mockImplementation((cb) => {
      return async (evt: any, ctx: any) => {
        const result = await cb(evt, ctx);
        expect(result).toEqual({
          Ref: event.PhysicalResourceId,
        });
      };
    });

  const { handler } = require('../../custom-resource-handlers/src/private-key');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockSecretsManagerClient.createSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.updateSecret).not.toHaveBeenCalled();
  expect(mockSecretsManagerClient.deleteSecret)
    .toHaveBeenCalledWith({
      SecretId: secretArn,
      ForceDeleteWithoutRecovery: true,
    });
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      event.PhysicalResourceId,
      { Ref: event.PhysicalResourceId });
});
