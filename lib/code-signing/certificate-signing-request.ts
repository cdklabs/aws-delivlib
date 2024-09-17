import * as path from 'path';
import {
  Duration,
  CustomResource,
  aws_lambda as lambda,
  aws_s3 as s3,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';
import { RsaPrivateKeySecret } from './private-key';
import { hashFileOrDirectory } from '../util';


export interface CertificateSigningRequestProps {
  /**
   * The RSA Private Key to use for this CSR.
   */
  privateKey: RsaPrivateKeySecret;
  /**
   * The Distinguished Name for this CSR.
   */
  dn: DistinguishedName;
  /**
   * The key usage requests for this CSR.
   *
   * @example critical,digitalSignature
   */
  keyUsage: string;
  /**
   * The extended key usage requests for this CSR.
   *
   * @example critical,codeSigning
   */
  extendedKeyUsage?: string;
}

/**
 * Creates a Certificate Signing Request (CSR), which will allow a Certificate Authority to provide a signed certificate
 * that uses the specified RSA Private Key. A CSR document can usually be shared publicly, however it must be noted that
 * the information provided in the ``dn`` fields, information about the public key and the intended ley usage will be
 * readable by anyone who can access the CSR.
 *
 * @see https://www.openssl.org/docs/manmaster/man1/req.html
 */
export class CertificateSigningRequest extends Construct {
  /**
   * The S3 URL to the CSR document.
   */
  public readonly pemRequest: string;

  /**
   * The S3 URL to a self-signed certificate that corresponds with this CSR.
   */
  public readonly selfSignedPemCertificate: string;

  /**
   * The S3 bucket where the self-signed certificate is stored.
   */
  public readonly outputBucket: s3.IBucket;

  constructor(parent: Construct, id: string, props: CertificateSigningRequestProps) {
    super(parent, id);

    const codeLocation = path.resolve(__dirname, '..', 'custom-resource-handlers');
    // change the resource id to force deleting existing function, and create new one, as Package type change is not allowed
    const customResource = new lambda.SingletonFunction(this, 'ResourceHandlerV2', {
      // change the uuid to force deleting existing function, and create new one, as Package type change is not allowed
      uuid: 'F0641C15-2BC0-481E-94BA-7BF43F8BBDE3',
      lambdaPurpose: 'CreateCSR',
      description: 'Creates a Certificate Signing Request document for an x509 certificate',
      architecture: lambda.Architecture.X86_64,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: new lambda.AssetImageCode(codeLocation, {
        file: 'Dockerfile',
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          FUN_SRC_DIR: 'certificate-signing-request',
        },
      }),
      timeout: Duration.seconds(300),
    });

    const outputBucket = new s3.Bucket(this, 'Bucket', {
      // CSRs can be easily re-created if lost or corrupt, so we can let those get to a black hole, no worries.
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    outputBucket.grantReadWrite(customResource);
    this.outputBucket = outputBucket;

    //change the custom resource id to force recreating new one because the change of the underneath lambda function
    const csr = new CustomResource(this, 'ResourceV2', {
      serviceToken: customResource.functionArn,
      resourceType: 'Custom::CertificateSigningRequest',
      pascalCaseProperties: true,
      properties: {
        resourceVersion: hashFileOrDirectory(codeLocation),
        // Private key
        privateKeySecretId: props.privateKey.secretArn,
        // Distinguished name
        dnCommonName: props.dn.commonName,
        dnCountry: props.dn.country,
        dnStateOrProvince: props.dn.stateOrProvince,
        dnLocality: props.dn.locality,
        dnOrganizationName: props.dn.organizationName,
        dnOrganizationalUnitName: props.dn.organizationalUnitName,
        dnEmailAddress: props.dn.emailAddress,
        // Key Usage
        extendedKeyUsage: props.extendedKeyUsage || '',
        keyUsage: props.keyUsage,
        // Ouput location
        outputBucket: outputBucket.bucketName,
      },
    });
    if (customResource.role) {
      // Make sure the permissions are all good before proceeding
      csr.node.addDependency(customResource.role);
      props.privateKey.grantGetSecretValue(customResource.role);
    }

    this.pemRequest = csr.getAtt('CSR').toString();
    this.selfSignedPemCertificate = csr.getAtt('SelfSignedCertificate').toString();
  }
}

/**
 * Fields that compose the distinguished name of a certificate
 */
export interface DistinguishedName {
  /** The Common Name (CN) */
  commonName: string;
  /** The email address (emailAddress) */
  emailAddress: string;

  /** The Country (C) */
  country: string;
  /** The State or Province (ST) */
  stateOrProvince: string;
  /** The locality (L) */
  locality: string;

  /** The organization name (O) */
  organizationName: string;
  /** The organizational unit name (OU) */
  organizationalUnitName: string;
}
