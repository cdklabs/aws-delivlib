import iam = require('@aws-cdk/aws-iam');

/**
 * Describe a Secrets Manager secret external to the CDK app
 */
export interface ExternalSecret {
  /**
   * The ARN of the AWS Secrets Manager secret.
   */
  secretArn: string;

  /**
   * ARN of the encryption key for this secret.
   *
   * (After creation of the project, you must manually grant "kms:Decrypt"
   * permissions on this key to the role created for this CodeBuild project).
   */
  keyArn?: string;

  /**
   * Optional role to be assumed in order to access the secret.
   * @default None
   */
  assumeRoleArn?: string;

  /**
   * The region where the secret is stored.
   * @default current region
   */
  region?: Region;
}

// List taken from https://docs.aws.amazon.com/general/latest/gr/rande.html.
export type Region =
  "us-east-1" |
  "us-east-2" |
  "us-west-1" |
  "us-west-2" |
  "ap-northeast-1" |
  "ap-northeast-2" |
  "ap-northeast-3" |
  "ap-south-1" |
  "ap-southeast-1" |
  "ap-southeast-2" |
  "ca-central-1" |
  "cn-north-1" |
  "cn-northwest-1" |
  "eu-central-1" |
  "eu-west-1" |
  "eu-west-2" |
  "eu-west-3" |
  "sa-east-1";

/**
 * Give the role permission to read a particular secret and its key.
 */
export function grantSecretRead(secret: ExternalSecret, identity: iam.IPrincipal) {
  identity.addToPolicy(new iam.PolicyStatement({
    resources: [secret.secretArn],
    actions: ['secretsmanager:ListSecrets', 'secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
  }));

  if (secret.keyArn) {
    identity.addToPolicy(new iam.PolicyStatement({
      resources: [secret.keyArn],
      actions: ['kms:Decrypt'],
    }));
  }
}

/**
 * Give the role permission to assume another role.
 */
export function grantAssumeRole(roleToAssumeArn: string, identity: iam.IPrincipal) {
  identity.addToPolicy(new iam.PolicyStatement({
    resources: [roleToAssumeArn],
    actions: ['sts:AssumeRole'],
  }));
}
