import { aws_kms as kms } from 'monocdk';
import * as cdk from 'monocdk';
import '@monocdk-experiment/assert/jest';
import * as delivlib from '../lib';


let app: cdk.App;
let stack: cdk.Stack;
let key: kms.Key;
beforeEach(() => {
  app = new cdk.App();
  const randomExtraContainer = new cdk.Construct(app, 'SomethingElse');
  stack = new cdk.Stack(randomExtraContainer, 'Stack', {
    stackName: 'ActualStackName',
  });
  key = new kms.Key(stack, 'Key');
});

const distinguishedName: delivlib.DistinguishedName = {
  commonName: 'CN',
  country: 'Country',
  emailAddress: 'Email',
  locality: 'Locality',
  organizationName: 'OrgName',
  organizationalUnitName: 'OrgUnitName',
  stateOrProvince: 'Province, Please',
};

test('secret name consists of stack name and relative construct path', () => {
  // WHEN
  const yetAnotherParent = new cdk.Construct(stack, 'Inbetween');
  new delivlib.CodeSigningCertificate(yetAnotherParent, 'Cert', {
    distinguishedName,
    pemCertificate: 'asdf',
    secretEncryptionKey: key,
  });

  // THEN - specifically: does not include construct names above the containing stack
  // uses the actual stack name (and not the stack NODE name)
  expect(stack).toHaveResource('Custom::RsaPrivateKeySecret', {
    SecretName: 'ActualStackName/Inbetween/Cert/RSAPrivateKey',
  });
});


test('secret name can be overridden', () => {
  // WHEN
  const yetAnotherParent = new cdk.Construct(stack, 'Inbetween');
  new delivlib.CodeSigningCertificate(yetAnotherParent, 'Cert', {
    distinguishedName,
    pemCertificate: 'asdf',
    secretEncryptionKey: key,
    baseName: 'Sekrit',
  });

  expect(stack).toHaveResource('Custom::RsaPrivateKeySecret', {
    SecretName: 'Sekrit/RSAPrivateKey',
  });
});
