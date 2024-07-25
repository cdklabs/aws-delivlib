import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { S3 } from '@aws-sdk/client-s3';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

import * as cfn from './_cloud-formation';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import _exec = require('./_exec');
import * as lambda from './_lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import _rmrf = require('./_rmrf');

const mkdtemp = util.promisify(fs.mkdtemp);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const secretsManager = new SecretsManager();

exports.handler = cfn.customResourceHandler(handleEvent);

interface ResourceAttributes extends cfn.ResourceAttributes {
  CSR: string;
  SelfSignedCertificate: string;
}

async function handleEvent(event: cfn.Event, _context: lambda.Context): Promise<cfn.ResourceAttributes> {
  if (event.RequestType !== cfn.RequestType.DELETE) {
    cfn.validateProperties(event.ResourceProperties, {
      DnCommonName: true,
      DnCountry: true,
      DnEmailAddress: true,
      DnLocality: true,
      DnOrganizationName: true,
      DnOrganizationalUnitName: true,
      DnStateOrProvince: true,
      ExtendedKeyUsage: false,
      KeyUsage: true,
      PrivateKeySecretId: true,
      OutputBucket: true,
    });
  }

  switch (event.RequestType) {
    case cfn.RequestType.CREATE:
    case cfn.RequestType.UPDATE:
      return _createSelfSignedCertificate(event);
    case cfn.RequestType.DELETE:
    // Nothing to do - this is not a "Physical" resource
      return { Ref: event.LogicalResourceId };
  }
}

async function _createSelfSignedCertificate(event: cfn.Event): Promise<ResourceAttributes> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'x509CSR-'));
  try {
    const configFile = await _makeCsrConfig(event, tempDir);
    const pkeyFile = await _retrievePrivateKey(event, tempDir);
    const csrFile = path.join(tempDir, 'csr.pem');
    await _exec('/opt/openssl', 'req', '-config', configFile,
      '-key', pkeyFile,
      '-out', csrFile,
      '-new');
    const certFile = path.join(tempDir, 'cert.pem');
    await _exec('/opt/openssl', 'x509', '-in', csrFile,
      '-out', certFile,
      '-req',
      '-signkey', pkeyFile,
      '-days', '365');

    const s3 = new S3();
    const bucketName: string = event.ResourceProperties.OutputBucket;
    await s3.putObject({
      Bucket: bucketName,
      Key: 'certificate-signing-request.pem',
      Body: await readFile(csrFile, { encoding: 'utf8' }),
      ContentType: 'application/x-pem-file',
    });
    await s3.putObject({
      Bucket: bucketName,
      Key: 'self-signed-certificate.pem',
      Body: await readFile(certFile, { encoding: 'utf8' }),
      ContentType: 'application/x-pem-file',
    });

    return {
      Ref: event.LogicalResourceId,
      CSR: `s3://${bucketName}/certificate-signing-request.pem`,
      SelfSignedCertificate: `s3://${bucketName}/self-signed-certificate.pem`,
    };
  } finally {
    await _rmrf(tempDir);
  }
}

async function _makeCsrConfig(event: cfn.Event, dir: string): Promise<string> {
  const file = path.join(dir, 'csr.config');
  await writeFile(file, [
    '[ req ]',
    'default_md           = sha256',
    'distinguished_name   = dn',
    'prompt               = no',
    'req_extensions       = extensions',
    'string_mask          = utf8only',
    'utf8                 = yes',
    '',
    '[ dn ]',
    `CN                   = ${event.ResourceProperties.DnCommonName}`,
    `C                    = ${event.ResourceProperties.DnCountry}`,
    `ST                   = ${event.ResourceProperties.DnStateOrProvince}`,
    `L                    = ${event.ResourceProperties.DnLocality}`,
    `O                    = ${event.ResourceProperties.DnOrganizationName}`,
    `OU                   = ${event.ResourceProperties.DnOrganizationalUnitName}`,
    `emailAddress         = ${event.ResourceProperties.DnEmailAddress}`,
    '',
    '[ extensions ]',
    `extendedKeyUsage     = ${event.ResourceProperties.ExtendedKeyUsage}`,
    `keyUsage             = ${event.ResourceProperties.KeyUsage}`,
    'subjectKeyIdentifier = hash',
  ].join('\n'), { encoding: 'utf8' });
  return file;
}

async function _retrievePrivateKey(event: cfn.Event, dir: string): Promise<string> {
  const file = path.join(dir, 'private_key.pem');
  const secret = await secretsManager.getSecretValue({
    SecretId: event.ResourceProperties.PrivateKeySecretId,
    VersionStage: 'AWSCURRENT',
  });
  await writeFile(file, secret.SecretString!, { encoding: 'utf8' });
  return file;
}
