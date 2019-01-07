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
}
