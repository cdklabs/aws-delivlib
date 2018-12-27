import aws = require('aws-sdk');
import fs = require('fs');
import os = require('os');
import path = require('path');
import util = require('util');

import cfn = require('./_cloud-formation');
import _exec = require('./_exec');
import lambda = require('./_lambda');
import _rmrf = require('./_rmrf');

const mkdtemp = util.promisify(fs.mkdtemp);
const readFile = util.promisify(fs.readFile);

const secretsManager = new aws.SecretsManager();

exports.handler = cfn.customResourceHandler(handleEvent);

async function handleEvent(event: cfn.Event, context: lambda.Context): Promise<cfn.ResourceAttributes> {
  if (event.RequestType !== cfn.RequestType.DELETE) {
    cfn.validateProperties(event.ResourceProperties, {
      Description: false,
      KeySize: true,
      KmsKeyId: false,
      SecretName: true,
    });
  }

  switch (event.RequestType) {
  case cfn.RequestType.CREATE:
    return await _createSecret(event, context);
  case cfn.RequestType.UPDATE:
    return await _updateSecret(event, context);
  case cfn.RequestType.DELETE:
    return await _deleteSecret(event);
  }
}

interface ResourceAttributes extends cfn.ResourceAttributes {
  SecretArn: string;
}

async function _createSecret(event: cfn.CreateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'x509PrivateKey-'));
  try {
    const pkeyFile = path.join(tmpDir, 'private_key.pem');
    await _exec('openssl', 'genrsa', '-out', pkeyFile, event.ResourceProperties.KeySize);
    const result = await secretsManager.createSecret({
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KmsKeyId,
      Name: event.ResourceProperties.SecretName,
      SecretString: await readFile(pkeyFile, { encoding: 'utf8' }),
    }).promise();
    return {
      Ref: result.ARN!,
      SecretArn: result.ARN!,
    };
  } finally {
    _rmrf(tmpDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<cfn.ResourceAttributes> {
  if (event.PhysicalResourceId.startsWith('arn:')) {
    await secretsManager.deleteSecret({ SecretId: event.PhysicalResourceId }).promise();
  }
  return { Ref: event.PhysicalResourceId };
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

  return {
    Ref: result.ARN!,
    SecretArn: result.ARN!,
  };
}
