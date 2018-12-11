import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import lambda = require('@aws-cdk/aws-lambda');
import cdk = require('@aws-cdk/cdk');
import fs = require('fs');
import path = require('path');

interface PGPSecretProps {
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
  encryptionKey: kms.EncryptionKeyRef;

  /**
   * Version of the key
   *
   * Bump this number to regenerate the key
   */
  version: number;
}

/**
 * A PGP key that is stored in Secrets Manager
 *
 * The string in secrets manager will be a JSON struct of
 *
 * { "PrivateKey": "... ASCII repr of key...", "Passphrase": "passphrase of the key" }
 */
export class PGPSecret extends cdk.Construct {
  public readonly secretArn: string;

  constructor(parent: cdk.Construct, name: string, props: PGPSecretProps) {
    super(parent, name);

    const keyActions = ['kms:GenerateDataKey', 'kms:Encrypt', 'kms:Decrypt'];

    const fn = new lambda.SingletonFunction(this, 'Lambda', {
      uuid: 'f25803d3-054b-44fc-985f-4860d7d6ee74',
      code: new lambda.InlineCode(fs.readFileSync(path.join(__dirname, 'pgpresource.py'), { encoding: 'utf-8' })),
      handler: 'index.main',
      timeout: 300,
      runtime: lambda.Runtime.Python36,
      initialPolicy: [
        new iam.PolicyStatement().addActions(
          'secretsmanager:CreateSecret', 'secretsmanager:UpdateSecret',
          'secretsmanager:DeleteSecret', 'ssm:PutParameter', 'ssm:DeleteParameter'
        ).addAllResources(),
        new iam.PolicyStatement().addActions(...keyActions).addResource(props.encryptionKey.keyArn)
      ]
    });

    props.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement().addActions(...keyActions).addAllResources().addPrincipal(fn.role!.principal)
    );

    const secret = new cfn.CustomResource(this, 'Resource', {
      lambdaProvider: fn,
      properties: {
        identity: props.identity,
        email: props.email,
        expiry: props.expiry,
        keySizeBits: props.keySizeBits,
        secretName: props.secretName,
        keyArn: props.encryptionKey.keyArn,
        parameterName: props.pubKeyParameterName,
        version: props.version
      },
    });
    this.secretArn = secret.getAtt('ARN').toString();
  }
}
