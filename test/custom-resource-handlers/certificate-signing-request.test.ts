import aws = require('aws-sdk');
import fs = require('fs');
import { createMockInstance } from 'jest-create-mock-instance';
import path = require('path');
import cfn = require('../../custom-resource-handlers/src/_cloud-formation');
import lambda = require('../../custom-resource-handlers/src/_lambda');

const context: lambda.Context = { awsRequestId: '90E99AAE-B120-409A-9156-0C5925FDD996' } as lambda.Context;
const eventBase = {
  LogicalResourceId: 'ResourceID12345689',
  ResponseURL: 'https://response/url',
  RequestId: '5EF100FB-0075-4716-970B-FBCA05BFE118',
  ResourceProperties: {
    DnCommonName:             'Test',
    DnCountry:                'FR',
    DnStateOrProvince:        'TestLand',
    DnLocality:               'Test City',
    DnOrganizationName:       'Test, Inc.',
    DnOrganizationalUnitName: 'QA Department',
    DnEmailAddress:           'test@acme.test',
    KeyUsage:                 'critical,use-the-key',
    ExtendedKeyUsage:         'critical,abuse-the-key',
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
  .mockImplementation(async (_, cb) => cb(undefined, mockTmpDir));
jest.spyOn(fs, 'readFile').mockName('fs.readFile')
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
  });
const mockWriteFile = jest.spyOn(fs, 'writeFile').mockName('fs.writeFile')
  .mockImplementation((_pth, _data, _opts, cb) => cb());
const mockSecretsManager = createMockInstance(aws.SecretsManager);
jest.spyOn(aws, 'SecretsManager').mockImplementation(() => mockSecretsManager);
mockSecretsManager.getSecretValue = jest.fn().mockName('SecretsManager.getSecretValue')
  .mockImplementation(() => ({ promise: () => Promise.resolve({ SecretString: mockPrivateKey }) })) as any;
const mockExec = jest.fn().mockName('_exec').mockRejectedValue(new Error('Unexpected call!'));
jest.mock('../../custom-resource-handlers/src/_exec', () => mockExec);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);
const mockRmrf = jest.fn().mockName('_rmrf')
  .mockResolvedValue(undefined);
jest.mock('../../custom-resource-handlers/src/_rmrf', () => mockRmrf);
cfn.sendResponse = jest.fn().mockName('cfn.sendResponse').mockResolvedValue(undefined);

beforeEach(() => jest.clearAllMocks());

test('Create', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.CREATE,
    PhysicalResourceId: undefined,
    ...eventBase,
  };

  mockExec.mockImplementation(async (cmd: string, ...args: string[]) => {
    await expect(cmd).toBe('openssl');
    switch (args[0]) {
    case 'req':
      await expect(args).toEqual(['req', '-config', require('path').join(mockTmpDir, 'csr.config'),
                                         '-key',    require('path').join(mockTmpDir, 'private_key.pem'),
                                         '-out',    require('path').join(mockTmpDir, 'csr.pem'),
                                         '-new']);
      break;
    case 'x509':
      await expect(args).toEqual(['x509', '-in',      require('path').join(mockTmpDir, 'csr.pem'),
                                          '-out',     require('path').join(mockTmpDir, 'cert.pem'),
                                          '-req',
                                          '-signkey', require('path').join(mockTmpDir, 'private_key.pem'),
                                          '-days', '365']);
      break;
    default:
      throw new Error(`Unexpected call!`);
    }
    return '';
  });

  const { main } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockWriteFile)
    .toBeCalledWith(path.join(mockTmpDir, 'csr.config'),
                    csrDocument,
                    expect.anything(),
                    expect.any(Function));
  await expect(mockWriteFile)
    .toBeCalledWith(path.join(mockTmpDir, 'private_key.pem'),
                    mockPrivateKey,
                    expect.anything(),
                    expect.any(Function));
  await expect(mockRmrf).toBeCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    event.LogicalResourceId,
                    { CSR: mockCsr, SelfSignedCertificate: mockCertificate });
});

test('Update', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.UPDATE,
    PhysicalResourceId: eventBase.LogicalResourceId,
    OldResourceProperties: eventBase.ResourceProperties,
    ...eventBase,
  };

  mockExec.mockImplementation(async (cmd: string, ...args: string[]) => {
    await expect(cmd).toBe('openssl');
    switch (args[0]) {
    case 'req':
      await expect(args).toEqual(['req', '-config', require('path').join(mockTmpDir, 'csr.config'),
                                         '-key',    require('path').join(mockTmpDir, 'private_key.pem'),
                                         '-out',    require('path').join(mockTmpDir, 'csr.pem'),
                                         '-new']);
      break;
    case 'x509':
      await expect(args).toEqual(['x509', '-in',      require('path').join(mockTmpDir, 'csr.pem'),
                                          '-out',     require('path').join(mockTmpDir, 'cert.pem'),
                                          '-req',
                                          '-signkey', require('path').join(mockTmpDir, 'private_key.pem'),
                                          '-days', '365']);
      break;
    default:
      throw new Error(`Unexpected call!`);
    }
    return '';
  });

  const { main } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(main(event, context)).resolves.toBe(undefined);

  await expect(mockWriteFile)
    .toBeCalledWith(path.join(mockTmpDir, 'csr.config'),
                    csrDocument,
                    expect.anything(),
                    expect.any(Function));
  await expect(mockWriteFile)
    .toBeCalledWith(path.join(mockTmpDir, 'private_key.pem'),
                    mockPrivateKey,
                    expect.anything(),
                    expect.any(Function));
  await expect(mockRmrf).toBeCalledWith(mockTmpDir);
  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    event.LogicalResourceId,
                    { CSR: mockCsr, SelfSignedCertificate: mockCertificate });
});

test('Delete', async () => {
  const event: cfn.Event = {
    RequestType: cfn.RequestType.DELETE,
    PhysicalResourceId: eventBase.LogicalResourceId,
    ...eventBase,
  };

  const { main } = require('../../custom-resource-handlers/src/certificate-signing-request');
  await expect(main(event, context)).resolves.toBe(undefined);

  return expect(cfn.sendResponse)
    .toBeCalledWith(event,
                    cfn.Status.SUCCESS,
                    event.LogicalResourceId,
                    { CSR: '', SelfSignedCertificate: '' });
});
