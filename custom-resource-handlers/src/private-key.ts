import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as aws from 'aws-sdk';

import * as cfn from './_cloud-formation';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import _exec = require('./_exec');
import * as lambda from './_lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
      return _createSecret(event, context);
    case cfn.RequestType.UPDATE:
      return _updateSecret(event, context);
    case cfn.RequestType.DELETE:
      return _deleteSecret(event);
  }
}

interface ResourceAttributes extends cfn.ResourceAttributes {
  SecretArn: string;
}

async function _createSecret(event: cfn.CreateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'x509PrivateKey-'));
  try {
    const pkeyFile = path.join(tmpDir, 'private_key.pem');
    await _exec('/opt/openssl', 'genrsa', '-out', pkeyFile, event.ResourceProperties.KeySize);
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
    await _rmrf(tmpDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<cfn.ResourceAttributes> {
  if (event.PhysicalResourceId.startsWith('arn:')) {
    await secretsManager.deleteSecret({
      SecretId: event.PhysicalResourceId,
      ForceDeleteWithoutRecovery: true,
    }).promise();
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
