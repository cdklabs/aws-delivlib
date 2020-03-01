import { aws_ssm as ssm } from "monocdk-experiment";
import { aws_secretsmanager as secretsManager } from "monocdk-experiment";





/**
 * A Credential Pair combines a secret element (the credential) and a public
 * element (the principal). The public element is stored in an SSM Parameter,
 * while the secret element is stored in AWS Secrets Manager.
 *
 * For example, this can be:
 * - A username and a password
 * - A private key and a certificate
 * - An OpenPGP Private key and its public part
 */
export interface ICredentialPair {
  /**
   * The public part of this credential pair.
   */
  readonly principal: ssm.IStringParameter;

  /**
   * The secret part of this credential pair.
   */
  readonly credential: secretsManager.ISecret;
}
