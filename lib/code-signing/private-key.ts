import { aws_cloudformation as cfn, aws_iam as iam, aws_kms as kms, aws_lambda as lambda } from "monocdk";
import * as cdk from 'monocdk';
import path = require("path");
import { hashFileOrDirectory } from "../util";
import { CertificateSigningRequest, DistinguishedName } from "./certificate-signing-request";





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
  removalPolicy?: cdk.RemovalPolicy;
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

  private secretArnLike: string;
  private masterKey?: kms.IKey;

  constructor(parent: cdk.Construct, id: string, props: RsaPrivateKeySecretProps) {
    super(parent, id);

    const codeLocation = path.resolve(__dirname, '..', '..', 'custom-resource-handlers', 'bin', 'private-key');
    const customResource = new lambda.SingletonFunction(this, 'ResourceHandler', {
      lambdaPurpose: 'RSAPrivate-Key',
      uuid: '72FD327D-3813-4632-9340-28EC437AA486',
      description: 'Generates an RSA Private Key and stores it in AWS Secrets Manager',
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: 'index.handler',
      code: new lambda.AssetCode(codeLocation),
      timeout: cdk.Duration.seconds(300),
      // add the layer that contains the OpenSSL CLI binary
      layers: [new lambda.LayerVersion(this, 'OpenSslCliLayer', {
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'custom-resource-handlers', 'layers', 'openssl-cli-layer.zip')),
      })],
    });

    this.secretArnLike = cdk.Stack.of(this).formatArn({
      service: 'secretsmanager',
      resource: 'secret',
      sep: ':',
      // The ARN of a secret has "-" followed by 6 random characters appended at the end
      resourceName: `${props.secretName}-??????`
    });
    customResource.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:UpdateSecret'
      ],
      resources: [this.secretArnLike],
    }));

    if (props.secretEncryptionKey) {
      props.secretEncryptionKey.addToResourcePolicy(new iam.PolicyStatement({
        // description: `Allow use via AWS Secrets Manager by CustomResource handler ${customResource.functionName}`,
        principals: [new iam.ArnPrincipal(customResource.role!.roleArn)],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`,
          },
          ArnLike: {
            'kms:EncryptionContext:SecretARN': this.secretArnLike,
          },
        },
      }));
    }

    const privateKey = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.lambda(customResource),
      resourceType: 'Custom::RsaPrivateKeySecret',
      properties: {
        resourceVersion: hashFileOrDirectory(codeLocation),
        description: props.description,
        keySize: props.keySize,
        secretName: props.secretName,
        kmsKeyId: props.secretEncryptionKey && props.secretEncryptionKey.keyArn,
      },
      removalPolicy: props.removalPolicy || cdk.RemovalPolicy.RETAIN,
    });
    if (customResource.role) {
      privateKey.node.addDependency(customResource.role);
      if (props.secretEncryptionKey) {
        // Modeling as a separate Policy to evade a dependency cycle (Role -> Key -> Role), as the Key refers to the
        // role in it's resource policy.
        privateKey.node.addDependency(new iam.Policy(this, 'GrantLambdaRoleKeyAccess', {
          roles: [customResource.role],
          statements: [
            new iam.PolicyStatement({
              // description: `AWSSecretsManager${props.secretName.replace(/[^0-9A-Za-z]/g, '')}CMK`,
              actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
              resources: [props.secretEncryptionKey.keyArn],
              conditions: {
                StringEquals: {
                  'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`
                },
                StringLike: { 'kms:EncryptionContext:SecretARN': [this.secretArnLike, 'RequestToValidateKeyAccess'] }
              },
            }),
          ]
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
      dn, keyUsage, extendedKeyUsage
    });
  }

  /**
   * Allows a given IAM Role to read the secret value.
   *
   * @param grantee the principal to which permissions should be granted.
   */
  public grantGetSecretValue(grantee: iam.IPrincipal): void {
    grantee.addToPolicy(new iam.PolicyStatement({
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
            'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`,
          },
          ArnLike: {
            'kms:EncryptionContext:SecretARN': this.secretArnLike,
          },
        },
      }));
      grantee.addToPolicy(new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [this.masterKey.keyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`,
          },
          ArnEquals: {
            'kms:EncryptionContext:SecretARN': this.secretArn,
          },
        },
      }));
    }
  }
}
