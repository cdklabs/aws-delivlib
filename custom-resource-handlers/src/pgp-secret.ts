import aws = require('aws-sdk');
import crypto = require('crypto');
import fs = require('fs');
import os = require('os');
import path = require('path');
import util = require('util');

import cfn = require('./_cloud-formation');
import _exec = require('./_exec');
import lambda = require('./_lambda');
import _rmrf = require('./_rmrf');
import { resolveCurrentVersionId } from './_secrets-manager';

const secretsManager = new aws.SecretsManager();
const ssm = new aws.SSM();

export async function main(event: cfn.Event, context: lambda.Context): Promise<void> {
  try {
    // tslint:disable-next-line:no-console
    console.log(`Input event: ${JSON.stringify(event)}`);
    const attributes = await handleEvent(event, context);
    await cfn.sendResponse(event,
                           cfn.Status.SUCCESS,
                           attributes.SecretArn || event.PhysicalResourceId || context.logStreamName,
                           attributes);
  } catch (e) {
    // tslint:disable-next-line:no-console
    console.error(e);
    await cfn.sendResponse(event,
                           cfn.Status.FAILED,
                           event.PhysicalResourceId || context.logStreamName,
                           { SecretArn: '' },
                           e.message);
  }
}

interface ResourceAttributes {
  SecretArn: string;
  SecretVersionId?: string;
  ParameterName?: string;

  [name: string]: string | undefined;
}

async function handleEvent(event: cfn.Event, context: lambda.Context): Promise<ResourceAttributes> {
  const props = event.ResourceProperties;
  let newKey = event.RequestType === cfn.RequestType.CREATE;

  if (event.RequestType === 'Update') {
    const oldProps = event.OldResourceProperties;
    const immutableFields = ['Email', 'Expiry', 'Identity', 'KeySizeBits', 'ParameterName', 'SecretName', 'Version'];
    for (const key of immutableFields) {
      if (props[key] !== oldProps[key]) {
        // tslint:disable-next-line:no-console
        console.log(`New key required: ${key} changed from ${oldProps[key]} to ${props[key]}`);
        newKey = true;
      }
    }
  }

  switch (event.RequestType) {
  case cfn.RequestType.CREATE:
  case cfn.RequestType.UPDATE:
    return newKey
          ? await _createNewKey(event, context)
          : await _updateExistingKey(event as cfn.UpdateEvent, context);
  case cfn.RequestType.DELETE:
    return await _deleteSecret(event);
  }
}

async function _createNewKey(event: cfn.CreateEvent | cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const passPhrase = crypto.randomBytes(32).toString('base64');
  const tempDir = await util.promisify(fs.mkdtemp)(path.join(os.tmpdir(), 'OpenPGP-'));
  try {
    process.env.GNUPGHOME = tempDir;

    const keyConfig = path.join(tempDir, 'key.config');
    await util.promisify(fs.writeFile)(keyConfig, [
      'Key-Type: RSA',
      `Key-Length: ${event.ResourceProperties.KeySizeBits}`,
      `Name-Real: ${event.ResourceProperties.Identity}`,
      `Name-Email: ${event.ResourceProperties.Email}`,
      `Expire-Date: ${event.ResourceProperties.Expiry}`,
      `Passphrase: ${passPhrase}`,
      '%commit',
      '%echo done',
    ].join('\n'), { encoding: 'utf8' });

    await _exec('gpg', '--batch', '--gen-key', keyConfig);
    const keyMaterial = await _exec('gpg', '--batch', '--yes', '--export-secret-keys', '--armor');
    const publicKey =   await _exec('gpg', '--batch', '--yes', '--export',             '--armor');
    const secretOpts = {
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KeyArn,
      SecretString: keyMaterial,
    };
    const secret = event.RequestType === cfn.RequestType.CREATE
                 ? await secretsManager.createSecret({ ...secretOpts, Name: event.ResourceProperties.SecretName }).promise()
                 : await secretsManager.updateSecret({ ...secretOpts, SecretId: event.PhysicalResourceId }).promise();
    await ssm.putParameter({
      Description: `Public part of OpenPGP key ${secret.ARN} (version ${secret.VersionId})`,
      Name: event.ResourceProperties.ParameterName,
      Overwrite: event.RequestType === 'Update',
      Type: 'String',
      Value: publicKey,
    }).promise();

    return { SecretArn: secret.ARN!, SecretVersionId: secret.VersionId!, ParameterName: event.ResourceProperties.ParameterName };
  } finally {
    await _rmrf(tempDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<ResourceAttributes> {
  if (!event.PhysicalResourceId.startsWith('arn:')) { return { SecretArn: '' }; }
  await ssm.deleteParameter({ Name: event.ResourceProperties.ParameterName }).promise();
  await secretsManager.deleteSecret({ SecretId: event.PhysicalResourceId }).promise();
  return { SecretArn: '' };
}

async function _updateExistingKey(event: cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const result = await secretsManager.updateSecret({
    ClientRequestToken: context.awsRequestId,
    Description: event.ResourceProperties.Description,
    KmsKeyId: event.ResourceProperties.KeyArn,
    SecretId: event.PhysicalResourceId,
  }).promise();
  return {
    SecretArn: result.ARN!,
    SecretVersionId: result.VersionId || await resolveCurrentVersionId(result.ARN!, secretsManager),
    ParameterName: event.ResourceProperties.ParameterName
  };
}
