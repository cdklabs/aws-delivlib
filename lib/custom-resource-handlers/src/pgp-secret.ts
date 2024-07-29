import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SSM } from '@aws-sdk/client-ssm';

import * as cfn from './_cloud-formation';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import _exec = require('./_exec');
import * as lambda from './_lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import _rmrf = require('./_rmrf');

const mkdtemp = util.promisify(fs.mkdtemp);
const writeFile = util.promisify(fs.writeFile);

const secretsManager = new SecretsManager();
const ssm = new SSM();

exports.handler = cfn.customResourceHandler(handleEvent);

// Used to be /opt/gpg, but now is just plain gpg
const GPG_BIN = 'gpg';


interface ResourceAttributes extends cfn.ResourceAttributes {
  SecretArn: string;
  PublicKey: string;
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
      SecretName: true,
      Version: false,
      DeleteImmediately: false,
    });
  }

  let newKey = event.RequestType === cfn.RequestType.CREATE;

  if (event.RequestType === cfn.RequestType.UPDATE) {
    const oldProps = event.OldResourceProperties;
    const immutableFields = ['Email', 'Expiry', 'Identity', 'KeySizeBits', 'SecretName', 'Version'];
    for (const key of immutableFields) {
      if (props[key] !== oldProps[key]) {
        // eslint-disable-next-line no-console
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
        ? _createNewKey(event, context)
        : _updateExistingKey(event as cfn.UpdateEvent, context);
    case cfn.RequestType.DELETE:
      return _deleteSecret(event);
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

    const gpgCommonArgs = [`--homedir=${tempDir}`, '--agent-program=/opt/gpg-agent'];
    await _exec(GPG_BIN, ...gpgCommonArgs, '--batch', '--gen-key', keyConfig);
    // Need the passphrase to export the private key
    const keyMaterial = await _exec(GPG_BIN, ...gpgCommonArgs, '--batch', '--yes', '--export-secret-keys', '--armor', '--pinentry-mode=loopback', `--passphrase=${passPhrase}`);
    const publicKey = await _exec(GPG_BIN, ...gpgCommonArgs, '--batch', '--yes', '--export', '--armor');
    const secretOpts = {
      ClientRequestToken: context.awsRequestId,
      Description: event.ResourceProperties.Description,
      KmsKeyId: event.ResourceProperties.KeyArn,
      SecretString: JSON.stringify({
        PrivateKey: keyMaterial,
        Passphrase: passPhrase,
      }),
    };
    const secret = event.RequestType === cfn.RequestType.CREATE
      ? await secretsManager.createSecret({ ...secretOpts, Name: event.ResourceProperties.SecretName })
      : await secretsManager.updateSecret({ ...secretOpts, SecretId: event.PhysicalResourceId });

    return {
      Ref: secret.ARN!,
      SecretArn: secret.ARN!,
      PublicKey: publicKey,
    };
  } finally {
    await _rmrf(tempDir);
  }
}

async function _updateExistingKey(event: cfn.UpdateEvent, context: lambda.Context): Promise<ResourceAttributes> {
  const publicKey = await _getPublicKey(event.PhysicalResourceId);
  const result = await secretsManager.updateSecret({
    ClientRequestToken: context.awsRequestId,
    Description: event.ResourceProperties.Description,
    KmsKeyId: event.ResourceProperties.KeyArn,
    SecretId: event.PhysicalResourceId,
  });

  if (event.OldResourceProperties.ParameterName) {
    // Migrating from a version that did create the SSM Parameter from the Custom Resource, so we'll delete that now in
    // order to allow the "external" creation to happen without problems...
    try {
      await ssm.deleteParameter({ Name: event.OldResourceProperties.ParameterName });
    } catch (e: any) {
      // Allow the parameter to already not exist, just in case!
      if (e.name !== 'ParameterNotFound') {
        throw e;
      }
    }
  }

  return {
    Ref: result.ARN!,
    SecretArn: result.ARN!,
    PublicKey: publicKey,
  };
}

async function _getPublicKey(secretArn: string): Promise<string> {
  const secretValue = await secretsManager.getSecretValue({ SecretId: secretArn });
  const keyData = JSON.parse(secretValue.SecretString!);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'OpenPGP-'));
  try {
    process.env.GNUPGHOME = tempDir;
    const privateKeyFile = path.join(tempDir, 'private.key');
    await writeFile(privateKeyFile, keyData.PrivateKey, { encoding: 'utf-8' });
    const gpgCommonArgs = [`--homedir=${tempDir}`, '--agent-program=/opt/gpg-agent'];
    // Note: importing a private key does NOT require entering it's passphrase!
    await _exec(GPG_BIN, ...gpgCommonArgs, '--batch', '--yes', '--import', privateKeyFile);
    return await _exec(GPG_BIN, ...gpgCommonArgs, '--batch', '--yes', '--export', '--armor');
  } finally {
    await _rmrf(tempDir);
  }
}

async function _deleteSecret(event: cfn.DeleteEvent): Promise<cfn.ResourceAttributes> {
  await secretsManager.deleteSecret({
    SecretId: event.PhysicalResourceId,
    ForceDeleteWithoutRecovery: !!event.ResourceProperties.DeleteImmediately,
  });
  return { Ref: event.PhysicalResourceId };
}
