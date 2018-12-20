import aws = require('aws-sdk');
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

export async function main(event: cfn.Event, context: lambda.Context): Promise<void> {
  try {
    // tslint:disable-next-line:no-console
    console.log(`Input event: ${JSON.stringify(event)}`);
    const attributes = await handleEvent(event, context);
    await cfn.sendResponse(event,
                          cfn.Status.SUCCESS,
                          attributes.SecretArn,
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

async function handleEvent(event: cfn.Event, context: lambda.Context): Promise<ResourceAttributes> {
  switch (event.RequestType) {
  case cfn.RequestType.CREATE:
    return await _createSecret(event, context);
  case cfn.RequestType.UPDATE:
    return await _updateSecret(event, context);
  case cfn.RequestType.DELETE:
    return await _deleteSecret(event);
  }
}

interface ResourceAttributes {
  SecretArn: string;
  SecretVersionId: string;

  [name: string]: string | undefined;
}

async function _createSecret(event: cfn.CreateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const tmpDir = await util.promisify(fs.mkdtemp)(os.tmpdir());
  try {
    const pkeyFile = path.join(tmpDir, 'private_key.pem');
    _exec(`openssl genrsa -out ${pkeyFile} ${event.ResourceProperties.KeySize}`);
    const result = await secretsManager.createSecret({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      Name: event.ResourceProperties.SecretName,
      SecretString: await util.promisify(fs.readFile)(pkeyFile, { encoding: 'utf8' }),
    }).promise();
    return { SecretArn: result.ARN!, SecretVersionId: result.VersionId! };
  } finally {
    _rmrf(tmpDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<ResourceAttributes> {
  if (event.PhysicalResourceId.startsWith('arn:')) {
    await secretsManager.deleteSecret({
      SecretId: event.PhysicalResourceId,
    }).promise();
  }
  return { SecretArn: '', SecretVersionId: '' };
}

async function _updateSecret(event: cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const props = event.ResourceProperties;
  const oldProps = event.OldResourceProperties;
  for (const key of ['KeySize', 'SecretName']) {
    if (oldProps[key] !== props[key]) {
      throw new Error(`The ${key} property cannot be updated, but it was changed from ${oldProps[key]} to ${props[key]}`);
    }
  }
  const result = await secretsManager.updateSecret({
    ClientRequestToken: context.awsRequestId,
    Description: props.Description,
    KmsKeyId: props.KmsKeyId,
    SecretId: event.PhysicalResourceId,
  }).promise();
  return { SecretArn: result.ARN!, SecretVersionId: result.VersionId || await resolveCurrentVersionId(result.ARN!, secretsManager) };
}
