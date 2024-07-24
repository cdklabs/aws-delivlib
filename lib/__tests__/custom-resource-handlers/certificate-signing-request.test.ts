/* eslint-disable @typescript-eslint/no-require-imports */
import fs = require('fs');
import path = require('path');
import { PutObjectCommandInput } from '@aws-sdk/client-s3';
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');
import lambda = require('../../custom-resource-handlers/src/_lambda');

const context: lambda.Context = { awsRequestId: '90E99AAE-B120-409A-9156-0C5925FDD996' } as lambda.Context;
const outputBucketName = 'csr-output-bucket-name';
const eventBase = {
  LogicalResourceId: 'ResourceID12345689',
  ResponseURL: 'https://response/url',
  RequestId: '5EF100FB-0075-4716-970B-FBCA05BFE118',
  ResourceProperties: {
    ServiceToken: 'Service-Token (Would be the function ARN',
    ResourceVersion: 'The hash of the function code',

    DnCommonName: 'Test',
    DnCountry: 'FR',
    DnStateOrProvince: 'TestLand',
    DnLocality: 'Test City',
    DnOrganizationName: 'Test, Inc.',
    DnOrganizationalUnitName: 'QA Department',
    DnEmailAddress: 'test@acme.test',
    KeyUsage: 'critical,use-the-key',
    ExtendedKeyUsage: 'critical,abuse-the-key',
    PrivateKeySecretId: 'arn:::private-key-secret',

    OutputBucket: outputBucketName,
  },
  ResourceType: 'Custom::Resource::Type',
  StackId: 'StackID-1324597',
};
const mockTmpDir = '/tmp/directory/is/phony';
const mockPrivateKey = 'Pretend private key';
const mockCsr = 'Pretend CSR';
const mockCertificate = 'Pretend Certificate';

const csrDocument = `[ req ]
default_md           = sha256
distinguished_name   = dn
prompt               = no
req_extensions       = extensions
string_mask          = utf8only
utf8                 = yes

[ dn ]
CN                   = ${eventBase.ResourceProperties.DnCommonName}
C                    = ${eventBase.ResourceProperties.DnCountry}
ST                   = ${eventBase.ResourceProperties.DnStateOrProvince}
L                    = ${eventBase.ResourceProperties.DnLocality}
O                    = ${eventBase.ResourceProperties.DnOrganizationName}
OU                   = ${eventBase.ResourceProperties.DnOrganizationalUnitName}
emailAddress         = ${eventBase.ResourceProperties.DnEmailAddress}

[ extensions ]
extendedKeyUsage     = ${eventBase.ResourceProperties.ExtendedKeyUsage}
keyUsage             = ${eventBase.ResourceProperties.KeyUsage}
subjectKeyIdentifier = hash`;

jest.spyOn(fs, 'mkdtemp').mockName('fs.mkdtemp')
  .mockImplementation(async (_, cb) => cb(undefined as any, mockTmpDir));
fs.readFile = jest.fn().mockName('fs.readFile')
  .mockImplementation(async (file, opts, cb) => {
    expect(opts.encoding).toBe('utf8');
    switch (file) {
      case require('path').join(mockTmpDir, 'csr.pem'):
        return cb(undefined, mockCsr);
      case require('path').join(mockTmpDir, 'cert.pem'):
        return cb(undefined, mockCertificate);
      default:
        cb(new Error('Unexpected call!'));
    }
  }) as any;
const mockWriteFile = fs.writeFile = jest.fn().mockName('fs.writeFile')
  .mockImplementation((_pth, _data, _opts, cb) => cb()) as any;

const mockExec = jest.fn().mockName('_exec').mockRejectedValue(new Error('Unexpected call!'));
jest.mock('../../custom-resource-handlers/src/_exec', () => mockExec);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);
const mockRmrf = jest.fn().mockName('_rmrf')
  .mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);
jest.spyOn(cfn, 'sendResponse').mockName('cfn.sendResponse').mockResolvedValue(Promise.resolve());

const mockSecretsManagerClient = {
  getSecretValue: jest.fn().mockName('SecretsManager.getSecretValue'),
};

const mockS3Client = {
  putObject: jest.fn().mockName('S3.putObject'),
};

jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManager: jest.fn().mockImplementation(() => {
      return mockSecretsManagerClient;
    }),
  };
});

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3: jest.fn().mockImplementation(() => {
      return mockS3Client;
    }),
  };
});

beforeEach(() => {
  mockSecretsManagerClient.getSecretValue.mockImplementation(() => Promise.resolve({ SecretString: mockPrivateKey }));
  mockS3Client.putObject.mockImplementation((request: PutObjectCommandInput) => {
    expect(request.Bucket).toBe(outputBucketName);
    expect(request.ContentType).toBe('application/x-pem-file');
    switch (request.Key) {
      case 'certificate-signing-request.pem':
        expect(request.Body).toBe(mockCsr);
        break;
      case 'self-signed-certificate.pem':
        expect(request.Body).toBe(mockCertificate);
        break;
      default:
        return Promise.reject(`Unexpected object key requested: ${request.Key}`);
    }

    return Promise.resolve();
  });
});

test('Create', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.CREATE,
    PhysicalResourceId: undefined,
    ...eventBase,
  };

  mockExec.mockImplementation(async (cmd: string, ...args: string[]) => {
    expect(cmd).toBe('/opt/openssl');
    switch (args[0]) {
      case 'req':
        expect(args).toEqual(['req', '-config', require('path').join(mockTmpDir, 'csr.config'),
          '-key', require('path').join(mockTmpDir, 'private_key.pem'),
          '-out', require('path').join(mockTmpDir, 'csr.pem'),
          '-new']);
        break;
      case 'x509':
        expect(args).toEqual(['x509', '-in', require('path').join(mockTmpDir, 'csr.pem'),
          '-out', require('path').join(mockTmpDir, 'cert.pem'),
          '-req',
          '-signkey', require('path').join(mockTmpDir, 'private_key.pem'),
          '-days', '365']);
        break;
      default:
        throw new Error('Unexpected call!');
    }
    return '';
  });

  const { handler } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockWriteFile)
    .toHaveBeenCalledWith(path.join(mockTmpDir, 'csr.config'),
      csrDocument,
      expect.anything(),
      expect.any(Function));
  expect(mockWriteFile)
    .toHaveBeenCalledWith(path.join(mockTmpDir, 'private_key.pem'),
      mockPrivateKey,
      expect.anything(),
      expect.any(Function));
  expect(mockS3Client.putObject).toHaveBeenCalledTimes(2);
  expect(mockRmrf).toHaveBeenCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      event.LogicalResourceId,
      { Ref: event.LogicalResourceId, CSR: `s3://${outputBucketName}/certificate-signing-request.pem`, SelfSignedCertificate: `s3://${outputBucketName}/self-signed-certificate.pem` });
});

test('Update', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: eventBase.LogicalResourceId,
    OldResourceProperties: eventBase.ResourceProperties,
    ...eventBase,
  };

  mockExec.mockImplementation(async (cmd: string, ...args: string[]) => {
    expect(cmd).toBe('/opt/openssl');
    switch (args[0]) {
      case 'req':
        expect(args).toEqual(['req', '-config', require('path').join(mockTmpDir, 'csr.config'),
          '-key', require('path').join(mockTmpDir, 'private_key.pem'),
          '-out', require('path').join(mockTmpDir, 'csr.pem'),
          '-new']);
        break;
      case 'x509':
        expect(args).toEqual(['x509', '-in', require('path').join(mockTmpDir, 'csr.pem'),
          '-out', require('path').join(mockTmpDir, 'cert.pem'),
          '-req',
          '-signkey', require('path').join(mockTmpDir, 'private_key.pem'),
          '-days', '365']);
        break;
      default:
        throw new Error('Unexpected call!');
    }
    return '';
  });

  const { handler } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockWriteFile)
    .toHaveBeenCalledWith(path.join(mockTmpDir, 'csr.config'),
      csrDocument,
      expect.anything(),
      expect.any(Function));
  expect(mockWriteFile)
    .toHaveBeenCalledWith(path.join(mockTmpDir, 'private_key.pem'),
      mockPrivateKey,
      expect.anything(),
      expect.any(Function));
  expect(mockS3Client.putObject).toHaveBeenCalledTimes(2);
  expect(mockRmrf).toHaveBeenCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      event.LogicalResourceId,
      { Ref: event.LogicalResourceId, CSR: `s3://${outputBucketName}/certificate-signing-request.pem`, SelfSignedCertificate: `s3://${outputBucketName}/self-signed-certificate.pem` });
});

test('Delete', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.DELETE,
    PhysicalResourceId: eventBase.LogicalResourceId,
    ...eventBase,
  };

  const { handler } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(handler(event, context)).resolves.toBe(undefined);

  return expect(cfn.sendResponse)
    .toHaveBeenCalledWith(event,
      cfn.Status.SUCCESS,
      event.LogicalResourceId,
      { Ref: event.LogicalResourceId });
});
