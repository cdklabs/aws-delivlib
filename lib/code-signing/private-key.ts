import * as path from 'path';
import {
  Duration, RemovalPolicy, Stack,
  ArnFormat, CustomResource,
  aws_iam as iam,
  aws_kms as kms,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { CertificateSigningRequest, DistinguishedName } from './certificate-signing-request';
import { hashFileOrDirectory } from '../util';


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
  secretEncryptionKey?: kms.IKey;

  /**
   * The deletion policy to apply on the Private Key secret.
   *
   * @default Retain
   */
  removalPolicy?: RemovalPolicy;
}

/**
 * An OpenSSL-generated RSA Private Key. It can for example be used to obtain a Certificate signed by a Certificate
 * Authority through the use of the ``CertificateSigningRequest`` construct (or via the
 * ``#newCertificateSigningRequest``) method.
 */
export class RsaPrivateKeySecret extends Construct {
  /**
   * The ARN of the secret that holds the private key.
   */
  public secretArn: string;
  public customResource: lambda.SingletonFunction;

  private secretArnLike: string;
  private masterKey?: kms.IKey;

  constructor(parent: Construct, id: string, props: RsaPrivateKeySecretProps) {
    super(parent, id);

    const codeLocation = path.resolve(__dirname, '..', 'custom-resource-handlers');
    // change the resource id to force deleting existing function, and create new one, as Package type change is not allowed
    this.customResource = new lambda.SingletonFunction(this, 'ResourceHandlerV2', {
      lambdaPurpose: 'RSAPrivate-Key',
      // change the uuid to force deleting existing function, and create new one, as Package type change is not allowed
      uuid: '517D342F-A590-447B-B525-5D06E403A406',
      description: 'Generates an RSA Private Key and stores it in AWS Secrets Manager',
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: new lambda.AssetImageCode(codeLocation, {
        file: 'Dockerfile',
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          FUN_SRC_DIR: 'private-key',
        },
        invalidation: {
          buildArgs: true,
        },
      }),
      timeout: Duration.seconds(300),
    });

    this.secretArnLike = Stack.of(this).formatArn({
      service: 'secretsmanager',
      resource: 'secret',
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      // The ARN of a secret has "-" followed by 6 random characters appended at the end
      resourceName: `${props.secretName}-??????`,
    });
    this.customResource.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:UpdateSecret',
      ],
      resources: [this.secretArnLike],
    }));

    if (props.secretEncryptionKey) {
      props.secretEncryptionKey.addToResourcePolicy(new iam.PolicyStatement({
        // description: `Allow use via AWS Secrets Manager by CustomResource handler ${customResource.functionName}`,
        principals: [new iam.ArnPrincipal(this.customResource.role!.roleArn)],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
          },
          ArnLike: {
            'kms:EncryptionContext:SecretARN': this.secretArnLike,
          },
        },
      }));
    }

    //change the custom resource id to force recreating new one because the change of the underneath lambda function
    const privateKey = new CustomResource(this, 'ResourceV2', {
      serviceToken: this.customResource.functionArn,
      resourceType: 'Custom::RsaPrivateKeySecret',
      pascalCaseProperties: true,
      properties: {
        resourceVersion: hashFileOrDirectory(codeLocation),
        description: props.description,
        keySize: props.keySize,
        secretName: props.secretName,
        kmsKeyId: props.secretEncryptionKey && props.secretEncryptionKey.keyArn,
      },
      removalPolicy: props.removalPolicy || RemovalPolicy.RETAIN,
    });
    if (this.customResource.role) {
      privateKey.node.addDependency(this.customResource.role);
      if (props.secretEncryptionKey) {
        // Modeling as a separate Policy to evade a dependency cycle (Role -> Key -> Role), as the Key refers to the
        // role in it's resource policy.
        privateKey.node.addDependency(new iam.Policy(this, 'GrantLambdaRoleKeyAccess', {
          roles: [this.customResource.role],
          statements: [
            new iam.PolicyStatement({
              // description: `AWSSecretsManager${props.secretName.replace(/[^0-9A-Za-z]/g, '')}CMK`,
              actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
              resources: [props.secretEncryptionKey.keyArn],
              conditions: {
                StringEquals: {
                  'kms:ViaService': `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
                },
                StringLike: { 'kms:EncryptionContext:SecretARN': [this.secretArnLike, 'RequestToValidateKeyAccess'] },
              },
            }),
          ],
        }));
      }
    }

    this.masterKey = props.secretEncryptionKey;
    this.secretArn = privateKey.getAtt('SecretArn').toString();
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
      dn,
      keyUsage,
      extendedKeyUsage,
    });
  }

  /**
   * Allows a given IAM Role to read the secret value.
   *
   * @param grantee the principal to which permissions should be granted.
   */
  public grantGetSecretValue(grantee: iam.IPrincipal): void {
    grantee.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [this.secretArn],
    }));
    if (this.masterKey) {
      // Add a key grant since we're using a CMK
      this.masterKey.addToResourcePolicy(new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        principals: [grantee.grantPrincipal],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
          },
          ArnLike: {
            'kms:EncryptionContext:SecretARN': this.secretArnLike,
          },
        },
      }));
      grantee.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [this.masterKey.keyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
          },
          ArnEquals: {
            'kms:EncryptionContext:SecretARN': this.secretArn,
          },
        },
      }));
    }
  }
}
