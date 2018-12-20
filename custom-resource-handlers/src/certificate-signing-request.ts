import aws = require('aws-sdk');
import fs = require('fs');
import os = require('os');
import path = require('path');
import util = require('util');

import cfn = require('./_cloud-formation');
import _exec = require('./_exec');
import lambda = require('./_lambda');
import _rmrf = require('./_rmrf');

const secretsManager = new aws.SecretsManager();

export async function main(event: cfn.Event, context: lambda.Context): Promise<void> {
  try {
    // tslint:disable-next-line:no-console
    console.log(`Input event: ${JSON.stringify(event)}`);
    const attributes = await handleEvent(event, context);
    await cfn.sendResponse(event,
                          cfn.Status.SUCCESS,
                          event.LogicalResourceId,
                          attributes);
  } catch (e) {
    // tslint:disable-next-line:no-console
    console.error(e);
    await cfn.sendResponse(event,
                          cfn.Status.FAILED,
                          event.LogicalResourceId,
                          { SecretArn: '' },
                          e.message);
  }
}

interface ResourceAttributes {
  CSR: string;
  SelfSignedCertificate: string;

  [name: string]: string | undefined;
}

async function handleEvent(event: cfn.Event, _context: lambda.Context): Promise<ResourceAttributes> {
  switch (event.RequestType) {
  case cfn.RequestType.CREATE:
  case cfn.RequestType.UPDATE:
    return _createSelfSignedCertificate(event);
  case cfn.RequestType.DELETE:
    // Nothing to do - this is not a "Physical" resource
    return { CSR: '', SelfSignedCertificate: '' };
  }
}

async function _createSelfSignedCertificate(event: cfn.Event): Promise<ResourceAttributes> {
  const tempDir = await util.promisify(fs.mkdtemp)(os.tmpdir());
  try {
    const configFile = await _makeCsrConfig(event, tempDir);
    const pkeyFile = await _retrievePrivateKey(event, tempDir);
    const csrFile = path.join(tempDir, 'csr.pem');
    await _exec(`openssl req -config ${configFile} -key ${pkeyFile} -out ${csrFile} -new`);
    const certFile = path.join(tempDir, 'cert.pem');
    await _exec(`openssl x509 -in ${csrFile} -out ${certFile} -req -signkey ${pkeyFile} -days 365`);
    return {
      CSR: await util.promisify(fs.readFile)(csrFile, { encoding: 'utf8' }),
      SelfSignedCertificate: await util.promisify(fs.readFile)(certFile, { encoding: 'utf8' }),
    };
  } finally {
    await _rmrf(tempDir);
  }
}

async function _makeCsrConfig(event: cfn.Event, dir: string): Promise<string> {
  const file = path.join(dir, 'csr.config');
  await util.promisify(fs.writeFile)(file, [
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
  ].join('\n'));
  return file;
}

async function _retrievePrivateKey(event: cfn.Event, dir: string): Promise<string> {
  const file = path.join(dir, 'private_key.pem');
  const secret = await secretsManager.getSecretValue({
    SecretId: event.ResourceProperties.PrivateKeySecretId,
    VersionId: event.ResourceProperties.PrivateKeySecretVersionId,
  }).promise();
  await util.promisify(fs.writeFile)(file, secret.SecretString!);
  return file;
}
