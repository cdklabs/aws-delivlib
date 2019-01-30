import kms = require('@aws-cdk/aws-kms');

/**
 * A Credential Pair combines a secret element and a public element. The public
 * element is stored in an SSM Parameter, while the secret element is stored in
 * AWS Secrets Manager.
 *
 * For example, this can be:
 * - A username and a password
 * - A private key and a certificate
 * - An OpenPGP Private key and its public part
 */
export interface ICredentialPair {
  /**
   * The ARN of the SSM parameter containing the public part of this credential
   * pair.
   */
  readonly publicPartParameterArn: string;

  /**
   * The name of the SSM parameter containing the public part of this credential
   * pair.
   */
  readonly publicPartParameterName: string;

  /**
   * The ARN of the AWS SecretsManager secret that holds the private part of
   * this credential pair.
   */
  readonly privatePartSecretArn: string;

  /**
   * The KMS Customer-Managed Key that is used to encrypt the private part of
   * this credential pair. If none was provided, the default KMS key for the
   * account and region will be used, and this property will be ``undefined``.
   */
  readonly privatePartEncryptionKey: kms.IEncryptionKey | undefined;
}
