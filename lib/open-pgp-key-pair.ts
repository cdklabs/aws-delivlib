import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import lambda = require('@aws-cdk/aws-lambda');
import secretsManager = require('@aws-cdk/aws-secretsmanager');
import ssm = require('@aws-cdk/aws-ssm');
import cdk = require('@aws-cdk/core');
import path = require('path');
import { ICredentialPair } from './credential-pair';
import { hashFileOrDirectory } from './util';

interface OpenPGPKeyPairProps {
  /**
   * Identity to put into the key
   */
  identity: string;

  /**
   * Email address to attach to the key
   */
  email: string;

  /**
   * Key size in bits (1024, 2048, 4096)
   */
  keySizeBits: number;

  /**
   * GPG expiry specifier
   *
   * Example: '1y'
   */
  expiry: string;

  /**
   * Name of secret to create in AWS Secrets Manager
   */
  secretName: string;

  /**
   * Name of SSM parameter to store public key
   */
  pubKeyParameterName: string;

  /**
   * KMS Key ARN to use to encrypt Secrets Manager Secret
   */
  encryptionKey?: kms.IKey;

  /**
   * Version of the key
   *
   * Bump this number to regenerate the key
   */
  version: number;

  /**
   * A description to attach to the AWS SecretsManager secret.
   */
  description?: string;
}

/**
 * A PGP key that is stored in Secrets Manager. The SecretsManager secret is retained when the resource is deleted.
 *
 * The string in secrets manager will be a JSON struct of
 *
 * { "PrivateKey": "... ASCII repr of key...", "Passphrase": "passphrase of the key" }
 */
export class OpenPGPKeyPair extends cdk.Construct implements ICredentialPair {
  public readonly principal: ssm.IStringParameter;
  public readonly credential: secretsManager.ISecret;

  constructor(parent: cdk.Construct, name: string, props: OpenPGPKeyPairProps) {
    super(parent, name);

    const codeLocation = path.resolve(__dirname, '..', 'custom-resource-handlers', 'bin', 'pgp-secret');

    const fn = new lambda.SingletonFunction(this, 'Lambda', {
      uuid: 'f25803d3-054b-44fc-985f-4860d7d6ee74',
      description: 'Generates an OpenPGP Key and stores the private key in Secrets Manager and the public key in an SSM Parameter',
      code: new lambda.AssetCode(codeLocation),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_8_10,
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:GetSecretValue',
        'secretsmanager:UpdateSecret',
      ],
      resources: [cdk.Stack.of(this).formatArn({
        service: 'secretsmanager',
        resource: 'secret',
        sep: ':',
        resourceName: `${props.secretName}-??????`
      })],
    }));

    // To allow easy migration from verison that handled the SSM parameter in the custom resource
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:DeleteParameter'],
      resources: ['*'],
    }));

    if (props.encryptionKey) {
      props.encryptionKey.addToResourcePolicy(new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
        principals: [fn.role!.grantPrincipal],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`,
          }
        },
      }));
    }

    const secret = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.lambda(fn),
      properties: {
        resourceVersion: hashFileOrDirectory(codeLocation),
        identity: props.identity,
        email: props.email,
        expiry: props.expiry,
        keySizeBits: props.keySizeBits,
        secretName: props.secretName,
        keyArn: props.encryptionKey && props.encryptionKey.keyArn,
        version: props.version,
        description: props.description,
      },
    });
    secret.node.addDependency(fn);

    this.credential = secretsManager.Secret.fromSecretAttributes(this, 'Credential', {
      encryptionKey: props.encryptionKey,
      secretArn: secret.getAtt('SecretArn').toString(),
    });
    this.principal = new ssm.StringParameter(this, 'Principal', {
      description: `The public part of the OpenPGP key in ${this.credential.secretArn}`,
      parameterName: props.pubKeyParameterName,
      stringValue: secret.getAtt('PublicKey').toString(),
    });
  }

  public grantRead(grantee: iam.IPrincipal): void {
    // Secret grant, identity-based only
    grantee.addToPolicy(new iam.PolicyStatement({
      resources: [this.credential.secretArn],
      actions: ['secretsmanager:ListSecrets', 'secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
    }));

    // Key grant
    if (this.credential.encryptionKey) {
      grantee.addToPolicy(new iam.PolicyStatement({
        resources: [this.credential.encryptionKey.keyArn],
        actions: ['kms:Decrypt'],
      }));

      this.credential.encryptionKey.addToResourcePolicy(new iam.PolicyStatement({
        resources: ['*'],
        principals: [grantee.grantPrincipal],
        actions: ['kms:Decrypt'],
      }));
    }
  }
}
