import * as path from 'path';
import {
  Duration, Stack, RemovalPolicy,
  CustomResource,
  aws_iam as iam,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_secretsmanager as secretsManager,
  aws_ssm as ssm,
  ArnFormat,
} from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { ICredentialPair } from './credential-pair';
import { hashFileOrDirectory } from './util';

/**
 * The type of the {@link OpenPGPKeyPairProps.removalPolicy} property.
 */
export enum OpenPGPKeyPairRemovalPolicy {
  /**
   * Keep the secret when this resource is deleted from the stack.
   * This is the default setting.
   */
  RETAIN,

  /**
   * Remove the secret when this resource is deleted from the stack,
   * but leave a grace period of a few days that allows you to cancel the deletion from the AWS Console.
   */
  DESTROY_SAFELY,

  /**
   * Remove the secret when this resource is deleted from the stack immediately.
   * Note that if you don't have a backup of this key somewhere,
   * this means it will be gone forever!
   */
  DESTROY_IMMEDIATELY,
}

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

  /**
   * What happens to the SecretsManager secret when this resource is removed from the stack.
   * The default is to keep the secret.
   *
   * @default OpenPGPKeyPairRemovalPolicy.RETAIN
   */
  removalPolicy?: OpenPGPKeyPairRemovalPolicy;
}

/**
 * A PGP key that is stored in Secrets Manager.
 * The SecretsManager secret is by default retained when the resource is deleted,
 * you can change that with the `removalPolicy` property.
 *
 * The string in secrets manager will be a JSON struct of
 *
 * { "PrivateKey": "... ASCII repr of key...", "Passphrase": "passphrase of the key" }
 */
export class OpenPGPKeyPair extends Construct implements ICredentialPair {
  public readonly principal: ssm.IStringParameter;
  public readonly credential: secretsManager.ISecret;

  constructor(parent: Construct, name: string, props: OpenPGPKeyPairProps) {
    super(parent, name);

    const codeLocation = path.resolve(__dirname, 'custom-resource-handlers');

    const fn = new lambda.SingletonFunction(this, 'Lambda', {
      // change the uuid to force deleting existing function, and create new one, as Package type change is not allowed
      uuid: '2422BDC2-DBB0-47C1-B701-5599E0849C54',
      description: 'Generates an OpenPGP Key and stores the private key in Secrets Manager and the public key in an SSM Parameter',
      code: new lambda.AssetImageCode(codeLocation, {
        file: 'Dockerfile',
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          FUN_SRC_DIR: 'pgp-secret',
        },
        invalidation: {
          buildArgs: true,
        },
      }),
      handler: lambda.Handler.FROM_IMAGE,
      timeout: Duration.seconds(300),
      runtime: lambda.Runtime.FROM_IMAGE,
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:GetSecretValue',
        'secretsmanager:UpdateSecret',
        'secretsmanager:DeleteSecret',
      ],
      resources: [Stack.of(this).formatArn({
        service: 'secretsmanager',
        resource: 'secret',
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        resourceName: `${props.secretName}-??????`,
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
            'kms:ViaService': `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
          },
        },
      }));
    }

    //change the custom resource id to force recreating new one because the change of the underneath lambda function
    const secret = new CustomResource(this, 'ResourceV2', {
      serviceToken: fn.functionArn,
      pascalCaseProperties: true,
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
        deleteImmediately: props.removalPolicy === OpenPGPKeyPairRemovalPolicy.DESTROY_IMMEDIATELY,
      },
      removalPolicy: openPgpKeyPairRemovalPolicyToCoreRemovalPolicy(props.removalPolicy),
    });
    secret.node.addDependency(fn);

    this.credential = secretsManager.Secret.fromSecretAttributes(this, 'Credential', {
      encryptionKey: props.encryptionKey,
      secretCompleteArn: secret.getAtt('SecretArn').toString(),
    });
    this.principal = new ssm.StringParameter(this, 'Principal', {
      description: `The public part of the OpenPGP key in ${this.credential.secretArn}`,
      parameterName: props.pubKeyParameterName,
      stringValue: secret.getAtt('PublicKey').toString(),
    });
  }

  public grantRead(grantee: iam.IPrincipal): void {
    // Secret grant, identity-based only
    grantee.addToPrincipalPolicy(new iam.PolicyStatement({
      resources: [this.credential.secretArn],
      actions: ['secretsmanager:ListSecrets', 'secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
    }));

    // Key grant
    if (this.credential.encryptionKey) {
      grantee.addToPrincipalPolicy(new iam.PolicyStatement({
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

function openPgpKeyPairRemovalPolicyToCoreRemovalPolicy(removalPolicy?: OpenPGPKeyPairRemovalPolicy): RemovalPolicy {
  if (removalPolicy === undefined) {
    return RemovalPolicy.RETAIN;
  }
  return removalPolicy === OpenPGPKeyPairRemovalPolicy.RETAIN
    ? RemovalPolicy.RETAIN
    : RemovalPolicy.DESTROY;
}
