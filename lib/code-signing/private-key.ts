import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import lambda = require('@aws-cdk/aws-lambda');
import cdk = require('@aws-cdk/cdk');
import fs = require('fs');
import path = require('path');
import { CertificateSigningRequest, DistinguishedName } from './certificate-signing-request';

export interface RsaPrivateKeySecretProps {
  /**
   * The modulus size of the RSA key that will be generated.
   *
   * The NIST publishes a document that provides guidance on how to select an appropriate key size:
   * @see https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-4/final
   */
  keySize: number;

  /**
   * The name of the AWS Secrets Manager entity that will be created to hold the private key.
   */
  secretName: string;

  /**
   * The description to attach to the AWS Secrets Manager entity that will hold the private key.
   */
  description?: string;

  /**
   * The KMS key to be used for encrypting the AWS Secrets Manager entity.
   *
   * @default the default KMS key will be used in accordance with AWS Secrets Manager default behavior.
   */
  secretEncryptionKey?: kms.EncryptionKeyRef;

  /**
   * The deletion policy to apply on the Private Key secret.
   *
   * @default Retain
   */
  deletionPolicy?: cdk.DeletionPolicy;
}

/**
 * An OpenSSL-generated RSA Private Key. It can for example be used to obtain a Certificate signed by a Certificate
 * Authority through the use of the ``CertificateSigningRequest`` construct (or via the
 * ``#newCertificateSigningRequest``) method.
 */
export class RsaPrivateKeySecret extends cdk.Construct {
  /**
   * The ARN of the secret that holds the private key.
   */
  public secretArn: string;
  /**
   * The VersionID of the secret that holds the private key.
   */
  public secretVersion: string;
  private secretArnLike: string;
  private masterKey?: kms.EncryptionKeyRef;

  constructor(parent: cdk.Construct, id: string, props: RsaPrivateKeySecretProps) {
    super(parent, id);

    props.deletionPolicy = props.deletionPolicy || cdk.DeletionPolicy.Retain;

    const customResource = new lambda.SingletonFunction(this, 'ResourceHandler', {
      uuid: '72FD327D-3813-4632-9340-28EC437AA486',
      runtime: lambda.Runtime.Python36,
      handler: 'index.main',
      code: new lambda.InlineCode(
        fs.readFileSync(path.join(__dirname, 'private-key.py'))
          .toString('utf8')
          // Remove blank and comment-only lines, to shrink code length
          .replace(/^[ \t]*(#[^\n]*)?\n/mg, '')
      ),
      timeout: 300,
    });

    this.secretArnLike = cdk.ArnUtils.fromComponents({
      service: 'secretsmanager',
      resource: 'secret',
      sep: ':',
      resourceName: `${props.secretName}-*`
    });
    customResource.addToRolePolicy(new iam.PolicyStatement()
      .addActions('secretsmanager:CreateSecret', 'secretsmanager:DeleteSecret')
      .addResource(this.secretArnLike));

    if (props.secretEncryptionKey) {
      props.secretEncryptionKey.addToResourcePolicy(new iam.PolicyStatement()
        .describe(`Allow use via AWS Secrets Manager by CustomResource handler ${customResource.functionName}`)
        .addAwsPrincipal(customResource.role!.roleArn)
        .addActions('kms:Decrypt', 'kms:GenerateDataKey')
        .addAllResources()
        .addCondition('StringEquals', {
          'kms:ViaService': new cdk.FnConcat('secretsmanager.', new cdk.AwsRegion(), '.amazonaws.com')
        })
        .addCondition('ArnLike', {
          'kms:EncryptionContext:SecretARN': this.secretArnLike
        }));
    }

    const privateKey = new cfn.CustomResource(this, 'Resource', {
      lambdaProvider: customResource,
      resourceType: 'Custom::RsaPrivateKeySecret',
      properties: {
        description: props.description,
        keySize: props.keySize,
        secretName: props.secretName,
        kmsKeyId: props.secretEncryptionKey && props.secretEncryptionKey.keyArn,
      }
    });
    if (customResource.role) {
      privateKey.addDependency(customResource.role);
      if (props.secretEncryptionKey) {
        // Modeling as a separate Policy to evade a dependency cycle (Role -> Key -> Role), as the Key refers to the
        // role in it's resource policy.
        privateKey.addDependency(new iam.Policy(this, 'GrantLambdaRoleKeyAccess', {
          roles: [customResource.role],
          statements: [
            new iam.PolicyStatement()
              .describe(`AWSSecretsManager${props.secretName.replace(/[^0-9A-Za-z-]/g, '')}CMK`)
              .addActions('kms:Decrypt', 'kms:GenerateDataKey')
              .addResource(props.secretEncryptionKey.keyArn)
              .addCondition('StringEquals', { 'kms:ViaService': new cdk.FnConcat('secretsmanager.', new cdk.AwsRegion(), '.amazonaws.com') })
              .addCondition('StringLike', { 'kms:EncryptionContext:SecretARN': [this.secretArnLike, 'RequestToValidateKeyAccess'] })
          ]
        }));
      }
    }
    privateKey.options.deletionPolicy = props.deletionPolicy;

    this.masterKey = props.secretEncryptionKey;
    this.secretArn = privateKey.getAtt('ARN').toString();
    this.secretVersion = privateKey.getAtt('VersionId').toString();
  }

  /**
   * Creates a new CSR resource using this private key.
   *
   * @param id               the ID of the construct in the construct tree.
   * @param dn               the distinguished name to record on the CSR.
   * @param keyUsage         the intended key usage (for example: "critical,digitalSignature")
   * @param extendedKeyUsage the indended extended key usage, if any (for example: "critical,digitalSignature")
   *
   * @returns a new ``CertificateSigningRequest`` instance that can be used to access the actual CSR document.
   */
  public newCertificateSigningRequest(id: string, dn: DistinguishedName, keyUsage: string, extendedKeyUsage?: string) {
    return new CertificateSigningRequest(this, id, {
      privateKey: this,
      dn, keyUsage, extendedKeyUsage
    });
  }

  /**
   * Allows a given IAM Role to read the secret value.
   *
   * @param role the role to which permissions should be granted.
   */
  public grantGetSecretValue(role: iam.Role): cdk.IDependable {
    role.addToPolicy(new iam.PolicyStatement().addAction('secretsmanager:GetSecretValue').addResource(this.secretArn));
    if (this.masterKey) {
      // Add a key grant since we're using a CMK
      this.masterKey.addToResourcePolicy(new iam.PolicyStatement()
        .addAction('kms:Decrypt')
        .addAllResources()
        .addAwsPrincipal(role.roleArn)
        .addCondition('StringEquals', {
          'kms:ViaService': new cdk.FnConcat('secretsmanager.', new cdk.AwsRegion(), '.amazonaws.com'),
        })
        .addCondition('ArnLike', {
          'kms:EncryptionContext:SecretARN': this.secretArnLike
        }));
      return new iam.Policy(role, `KMS-CMK-Access-${this.id}`, {
        roles: [role],
        statements: [
          new iam.PolicyStatement()
          .addAction('kms:Decrypt')
          .addResource(this.masterKey.keyArn)
          .addCondition('StringEquals', {
            'kms:ViaService': new cdk.FnConcat('secretsmanager.', new cdk.AwsRegion(), '.amazonaws.com'),
            'kms:EncryptionContext:SecretVersionId': this.secretVersion,
          })
          .addCondition('ArnEquals', {
            'kms:EncryptionContext:SecretARN': this.secretArn,
          })
        ]
      });
    }
    return { dependencyElements: [] };
  }
}
