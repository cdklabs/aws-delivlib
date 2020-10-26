import { aws_cloudformation as cfn, aws_lambda as lambda} from "monocdk";
import * as cdk from 'monocdk';
import path = require("path");
import { hashFileOrDirectory } from "../util";
import { RsaPrivateKeySecret } from "./private-key";





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
export class CertificateSigningRequest extends cdk.Construct {
  /**
   * The PEM-encoded CSR document.
   */
  public readonly pemRequest: string;

  public readonly selfSignedPemCertificate: string;

  constructor(parent: cdk.Construct, id: string, props: CertificateSigningRequestProps) {
    super(parent, id);

    const codeLocation = path.resolve(__dirname, '..', '..', 'custom-resource-handlers', 'bin', 'certificate-signing-request');
    const customResource = new lambda.SingletonFunction(this, 'ResourceHandler', {
      uuid: '541F6782-6DCF-49A7-8C5A-67715ADD9E4C',
      lambdaPurpose: 'CreateCSR',
      description: 'Creates a Certificate Signing Request document for an x509 certificate',
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: 'index.handler',
      code: new lambda.AssetCode(codeLocation),
      timeout: cdk.Duration.seconds(300),
      // add the layer that contains the OpenSSL CLI binary
      layers: [new lambda.LayerVersion(this, 'OpenSslCliLayer', {
        code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'custom-resource-handlers', 'layers', 'openssl-cli-layer.zip')),
      })],
    });

    const csr = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.lambda(customResource),
      resourceType: 'Custom::CertificateSigningRequest',
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
      }
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
