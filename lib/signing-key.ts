import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/cdk');
import { OpenPGPKeyPair } from './open-pgp-key-pair';

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
 *
 * @deprecated Use the OpenPGPKeyPair class instead.
 */
export class OpenPgpKey extends cdk.Construct {
  public readonly scope: string;

  private readonly key: kms.IEncryptionKey;
  private readonly secret: OpenPGPKeyPair;

  constructor(parent: cdk.Construct, name: string, props: SigningKeyProps) {
    super(parent, name);

    this.scope = props.secretName || this.node.uniqueId;
    const secretName = `${this.scope}/SigningKey`;

    this.key = new kms.EncryptionKey(this, 'Key', {
      description: `Encryption key for PGP secret ${secretName}`,
    });

    // The key has an alias for descriptive purposes, but the alias is not used
    this.key.addAlias(`alias/${secretName}Key`);

    this.secret = new OpenPGPKeyPair(this, 'Secret', {
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
    return this.secret.grantRead(identity);
  }
}
