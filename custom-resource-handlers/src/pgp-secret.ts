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

const mkdtemp = util.promisify(fs.mkdtemp);
const writeFile = util.promisify(fs.writeFile);

const secretsManager = new aws.SecretsManager();
const ssm = new aws.SSM();

exports.handler = cfn.customResourceHandler(handleEvent);

interface ResourceAttributes extends cfn.ResourceAttributes {
  SecretArn: string;
  ParameterName: string;
}

async function handleEvent(event: cfn.Event, context: lambda.Context): Promise<cfn.ResourceAttributes> {
  const props = event.ResourceProperties;

  if (event.RequestType !== cfn.RequestType.DELETE) {
    cfn.validateProperties(props, {
      Description: false,
      Email: true,
      Expiry: true,
      Identity: true,
      KeyArn: false,
      KeySizeBits: true,
      ParameterName: true,
      SecretName: true,
      Version: false,
    });
  }

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
    // If we're UPDATE and get a new key, we'll issue a new Physical ID.
    return newKey
          ? await _createNewKey(event, context)
          : await _updateExistingKey(event as cfn.UpdateEvent, context);
  case cfn.RequestType.DELETE:
    return await _deleteSecret(event);
  }
}

async function _createNewKey(event: cfn.CreateEvent | cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const passPhrase = crypto.randomBytes(32).toString('base64');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'OpenPGP-'));
  try {
    process.env.GNUPGHOME = tempDir;

    const keyConfig = path.join(tempDir, 'key.config');
    await writeFile(keyConfig, [
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
      Description: `Public part of OpenPGP key ${secret.ARN}`,
      Name: event.ResourceProperties.ParameterName,
      Overwrite: event.RequestType === 'Update',
      Type: 'String',
      Value: publicKey,
    }).promise();

    return {
      Ref: secret.ARN!,
      SecretArn: secret.ARN!,
      ParameterName: event.ResourceProperties.ParameterName
    };
  } finally {
    await _rmrf(tempDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<cfn.ResourceAttributes> {
  if (event.PhysicalResourceId.startsWith('arn:')) {
    await ssm.deleteParameter({ Name: event.ResourceProperties.ParameterName }).promise();
    await secretsManager.deleteSecret({ SecretId: event.PhysicalResourceId }).promise();
  }
  return { Ref: event.PhysicalResourceId };
}

async function _updateExistingKey(event: cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const result = await secretsManager.updateSecret({
    ClientRequestToken: context.awsRequestId,
    Description: event.ResourceProperties.Description,
    KmsKeyId: event.ResourceProperties.KeyArn,
    SecretId: event.PhysicalResourceId,
  }).promise();

  return {
    Ref: result.ARN!,
    SecretArn: result.ARN!,
    ParameterName: event.ResourceProperties.ParameterName
  };
}
