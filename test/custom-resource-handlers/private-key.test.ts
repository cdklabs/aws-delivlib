import aws = require('aws-sdk');
import fs = require('fs');
import { createMockInstance } from 'jest-create-mock-instance';
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');
import lambda = require('../../custom-resource-handlers/src/_lambda');
import secretsManager = require('../../custom-resource-handlers/src/_secrets-manager');

const context: lambda.Context = { awsRequestId: '90E99AAE-B120-409A-9156-0C5925FDD996' } as lambda.Context;
const mockKeySize = 4_096;
const eventBase = {
  LogicalResourceId: 'ResourceID12345689',
  ResponseURL: 'https://response/url',
  RequestId: '5EF100FB-0075-4716-970B-FBCA05BFE118',
  ResourceProperties: {
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
const secretVersionId = 'secret-version-id';

cfn.sendResponse = jest.fn().mockName('cfn.sendResponse').mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_exec', () => async (cmd: string, ...args: string[]) => {
  await expect(cmd).toBe('openssl');
  await expect(args).toEqual(['genrsa', '-out', require('path').join(mockTmpDir, 'private_key.pem'), mockKeySize]);
  return '';
});
jest.spyOn(fs, 'mkdtemp').mockName('fs.mkdtemp')
  .mockImplementation(async (_, cb) => cb(undefined, mockTmpDir));
jest.spyOn(fs, 'readFile').mockName('fs.readFile')
  .mockImplementation(async (file, opts, cb) => {
    await expect(file).toBe(require('path').join(mockTmpDir, 'private_key.pem'));
    await expect(opts.encoding).toBe('utf8');
    return cb(undefined, mockPrivateKey);
  });
const mockSecretsManager = createMockInstance(aws.SecretsManager);
jest.spyOn(aws, 'SecretsManager').mockImplementation(() => mockSecretsManager);
mockSecretsManager.createSecret = jest.fn().mockName('SecretsManager.createSecret')
  .mockImplementation(() => ({ promise: () => Promise.resolve({ ARN: secretArn, VersionId: secretVersionId }) })) as any;
mockSecretsManager.updateSecret = jest.fn().mockName('SecretsManager.updateSecret')
  .mockImplementation(() => ({ promise: () => Promise.resolve({ ARN: secretArn }) })) as any;
mockSecretsManager.deleteSecret = jest.fn().mockName('SecretsManager.deleteSecret')
  .mockImplementation(() => ({ promise: () => Promise.resolve({}) })) as any;
const mockRmrf = jest.fn().mockName('_rmrf').mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);
secretsManager.resolveCurrentVersionId = jest.fn().mockName('resolveCurrentVersionId')
  .mockResolvedValue(secretVersionId);

beforeEach(() => jest.clearAllMocks());

test('Create', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.CREATE,
    PhysicalResourceId: undefined,
    ...eventBase,
  };

  const { main } = require('../../custom-resource-handlers/src/private-key');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockSecretsManager.createSecret)
    .toBeCalledWith({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      Name: event.ResourceProperties.SecretName,
      SecretString: mockPrivateKey,
    });
  await expect(mockSecretsManager.updateSecret).not.toBeCalled();
  await expect(mockSecretsManager.deleteSecret).not.toBeCalled();
  await expect(mockRmrf).toBeCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    secretArn,
                    { SecretArn: secretArn, SecretVersionId: secretVersionId });
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

  const { main } = require('../../custom-resource-handlers/src/private-key');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockSecretsManager.createSecret).not.toBeCalled();
  await expect(mockSecretsManager.updateSecret).not.toBeCalled();
  await expect(mockSecretsManager.deleteSecret).not.toBeCalled();
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.FAILED,
                    secretArn,
                    { SecretArn: '' },
                    expect.stringContaining('The KeySize property cannot be updated'));
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

  const { main } = require('../../custom-resource-handlers/src/private-key');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockSecretsManager.createSecret).not.toBeCalled();
  await expect(mockSecretsManager.updateSecret).not.toBeCalled();
  await expect(mockSecretsManager.deleteSecret).not.toBeCalled();
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.FAILED,
                    secretArn,
                    { SecretArn: '' },
                    expect.stringContaining('The KeySize property cannot be updated'));
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

  const { main } = require('../../custom-resource-handlers/src/private-key');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockSecretsManager.createSecret).not.toBeCalled();
  await expect(mockSecretsManager.updateSecret)
    .toBeCalledWith({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      SecretId: secretArn,
    });
  await expect(mockSecretsManager.deleteSecret).not.toBeCalled();
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    secretArn,
                    { SecretArn: secretArn, SecretVersionId: secretVersionId });
});

test('Delete', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.DELETE,
    PhysicalResourceId: secretArn,
    ...eventBase,
  };

  const { main } = require('../../custom-resource-handlers/src/private-key');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockSecretsManager.createSecret).not.toBeCalled();
  await expect(mockSecretsManager.updateSecret).not.toBeCalled();
  await expect(mockSecretsManager.deleteSecret)
    .toBeCalledWith({ SecretId: secretArn });
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    '',
                    { SecretArn: '', SecretVersionId: '' });
});
