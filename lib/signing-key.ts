import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/cdk');
import { PGPSecret } from './pgp-secret';

/**
 * Construction properties for a SigningKey
 */
export interface SigningKeyProps {
  /**
   * The AWS Secrets Manager secret name to use for this key.
   *
   * The secret will be named "<scope>/SigningKey".
   *
   * @default A unique secret name will be automatically generated
   */
  secretName?: string;

  /**
   * Name to put on key
   */
  identity: string;

  /**
   * Email address to put on key
   */
  email: string;
}

/**
 * A combination of a Secrets Manager secret and a unique KMS key per secret
 *
 * The KMS key is there to control access to the secret, as the secret
 * itself doesn't support resource policies yet.
 */
export class OpenPgpKey extends cdk.Construct {
  public readonly scope: string;

  private readonly key: kms.EncryptionKeyRef;
  private readonly secret: PGPSecret;

  constructor(parent: cdk.Construct, name: string, props: SigningKeyProps) {
    super(parent, name);

    this.scope = props.secretName || this.uniqueId;
    const secretName = `${this.scope}/SigningKey`;

    this.key = new kms.EncryptionKey(this, 'Key', {
      description: `Encryption key for PGP secret ${secretName}`
    });

    // The key has an alias for descriptive purposes, but the alias is not used
    this.key.addAlias(`alias/${secretName}Key`);

    this.secret = new PGPSecret(this, 'Secret', {
      identity: props.identity,
      email: props.email,
      keySizeBits: 4096,
      expiry: '4y',
      secretName,
      pubKeyParameterName: `/${secretName}.pub`,
      encryptionKey: this.key,
      version: 1
    });
  }

  public grantRead(identity: iam.IPrincipal) {
    // Secret grant, identity-based only
    identity.addToPolicy(new iam.PolicyStatement()
      .addResources(this.secret.secretArn)
      .addActions('secretsmanager:ListSecrets', 'secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'));

    // Key grant
    identity.addToPolicy(new iam.PolicyStatement()
      .addResources(this.key.keyArn)
      .addActions('kms:Decrypt'));

    this.key.addToResourcePolicy(new iam.PolicyStatement()
      .addAllResources()
      .addPrincipal(identity.principal)
      .addActions('kms:Decrypt'));
  }
}
