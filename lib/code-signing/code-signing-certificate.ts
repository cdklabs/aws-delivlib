import {
  CfnOutput, RemovalPolicy, Stack,
  aws_iam as iam,
  aws_kms as kms,
  aws_s3 as s3,
  aws_secretsmanager as secretsManager,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { CertificateSigningRequest, DistinguishedName } from './certificate-signing-request';
import { RsaPrivateKeySecret } from './private-key';
import { ICredentialPair } from '../credential-pair';
import * as permissions from '../permissions';


export { DistinguishedName } from './certificate-signing-request';

interface CodeSigningCertificateProps {
  /**
   * The number of bits to compose the modulus of the generated private key for this certificate.
   *
   * @default 2048
   */
  rsaKeySize?: number;

  /**
   * The KMS CMK to use for encrypting the Private Key secret.
   * @default A new KMS key will be allocated for you
   */
  secretEncryptionKey?: kms.IKey;

  /**
   * The PEM-encoded certificate that was signed by the relevant authority.
   *
   * @default If a certificate is not provided, a self-signed certificate will
   * be generated and a CSR (certificate signing request) will by available in
   * the stack output.
   */
  pemCertificate?: string;

  /**
   * Whether a CSR should be generated, even if the certificate is provided.
   * This can be useful if one wants to renew a certificate that is close to
   * expiry without generating a new private key (for example, to avoid breaking
   * clients that make use of certificate pinning).
   *
   * @default false
   */
  forceCertificateSigningRequest?: boolean;

  /**
   * When enabled, the Private Key secret will have a DeletionPolicy of
   * "RETAIN", making sure the Private Key is not inadvertently destroyed.
   *
   * @default true
   */
  retainPrivateKey?: boolean;

  /**
   * The Distinguished Name for this CSR.
   */
  distinguishedName: DistinguishedName;

  /**
   * Base names for the private key and output SSM parameter
   *
   * @default - Automatically generated
   */
  readonly baseName?: string;
}

export interface ICodeSigningCertificate extends IConstruct, ICredentialPair {
  /**
   * The S3 bucket where the self-signed certificate is stored.
   */
  readonly certificateBucket?: s3.IBucket;

  /**
   * Grant the IAM principal permissions to read the private key and
   * certificate.
   */
  grantDecrypt(principal?: iam.IPrincipal): void;
}

/**
 * A Code-Signing certificate, that will use a private key that is generated by a Lambda function. The Certificate will
 * not be usable until the ``pemCertificate`` value has been provided. A typical workflow to use this Construct would be:
 *
 * 1. Add an instance of the construct to your app, without providing the ``pemCertificate`` property
 * 2. Deploy the stack to provision a Private Key and obtain the CSR (you can surface it using a Output, for example)
 * 3. Submit the CSR to your Certificate Authority of choice.
 * 4. Populate the ``pemCertificate`` property with the PEM-encoded certificate provided by your CA of coice.
 * 5. Re-deploy the stack so make the certificate usable
 *
 * In order to renew the certificate, if you do not wish to retain the same private key (your clients do not rely on
 * public key pinning), simply add a new instance of the construct to your app and follow the process listed above. If
 * you wish to retain the private key, you can set ``forceCertificateSigningRequest`` to ``true`` in order to obtain a
 * new CSR document.
 */
export class CodeSigningCertificate extends Construct implements ICodeSigningCertificate {
  /**
   * The AWS Secrets Manager secret that holds the private key for this CSC
   */
  public readonly credential: secretsManager.ISecret;

  /**
   * The AWS SSM Parameter that holds the certificate for this CSC.
   */
  public readonly principal: ssm.IStringParameter;

  /**
   * The S3 bucket where the self-signed certificate is stored.
   */
  public readonly certificateBucket?: s3.IBucket;

  constructor(parent: Construct, id: string, props: CodeSigningCertificateProps) {
    super(parent, id);

    // The construct path of this construct with respect to the containing stack, without any leading /
    const stack = Stack.of(this);
    const baseName = props.baseName ?? `${stack.stackName}${this.node.path.substr(stack.node.path.length)}`;

    const privateKey = new RsaPrivateKeySecret(this, 'RSAPrivateKey', {
      removalPolicy: props.retainPrivateKey === false ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      description: 'The PEM-encoded private key of the x509 Code-Signing Certificate',
      keySize: props.rsaKeySize || 2048,
      secretEncryptionKey: props.secretEncryptionKey,
      // rename the secret name, as it will be deleted wile the previous custom resource got deleted,
      // and so when the new custom resource got created, it will fail as it will try to create a new secret
      // with same name
      secretName: `${baseName}/RSAPrivateKeyV2`,
    });

    this.credential = secretsManager.Secret.fromSecretAttributes(this, 'Credential', {
      encryptionKey: props.secretEncryptionKey,
      secretCompleteArn: privateKey.secretArn,
    });

    let certificate = props.pemCertificate;

    if (!certificate || props.forceCertificateSigningRequest) {
      const csr: CertificateSigningRequest = privateKey.newCertificateSigningRequest('CertificateSigningRequest',
        props.distinguishedName,
        'critical,digitalSignature',
        'critical,codeSigning');

      this.certificateBucket = csr.outputBucket;

      new CfnOutput(this, 'CSR', {
        description: 'A PEM-encoded Certificate Signing Request for a Code-Signing Certificate',
        value: csr.pemRequest,
      });

      if (!certificate) {
        certificate = csr.selfSignedPemCertificate;
      }
    }

    this.principal = new ssm.StringParameter(this, 'Resource', {
      description: `A PEM-encoded Code-Signing Certificate (private key in ${privateKey.secretArn})`,
      parameterName: `/${baseName}/Certificate`,
      stringValue: certificate!,
    });
  }

  /**
   * Grant the IAM principal permissions to read the private key and
   * certificate.
   */
  public grantDecrypt(principal?: iam.IPrincipal) {
    if (!principal) { return; }

    permissions.grantSecretRead({
      keyArn: this.credential.encryptionKey && this.credential.encryptionKey.keyArn,
      secretArn: this.credential.secretArn,
    }, principal);

    principal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [Stack.of(this).formatArn({
        // TODO: This is a workaround until https://github.com/awslabs/aws-cdk/pull/1726 is released
        service: 'ssm',
        resource: `parameter${this.principal.parameterName}`,
      })],
    }));

    this.certificateBucket?.grantRead(principal);
  }
}
