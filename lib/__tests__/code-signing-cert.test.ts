import {
  App, Stack,
  aws_kms as kms,
} from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import * as delivlib from '../../lib';


let app: App;
let stack: Stack;
let key: kms.Key;
beforeEach(() => {
  app = new App();
  const randomExtraContainer = new Construct(app, 'SomethingElse');
  stack = new Stack(randomExtraContainer, 'Stack', {
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
  const yetAnotherParent = new Construct(stack, 'Inbetween');
  new delivlib.CodeSigningCertificate(yetAnotherParent, 'Cert', {
    distinguishedName,
    pemCertificate: 'asdf',
    secretEncryptionKey: key,
  });
  const template = Template.fromStack(stack);

  // THEN - specifically: does not include construct names above the containing stack
  // uses the actual stack name (and not the stack NODE name)
  template.hasResourceProperties('Custom::RsaPrivateKeySecret', {
    SecretName: 'ActualStackName/Inbetween/Cert/RSAPrivateKey',
  });
});


test('secret name can be overridden', () => {
  // WHEN
  const yetAnotherParent = new Construct(stack, 'Inbetween');
  new delivlib.CodeSigningCertificate(yetAnotherParent, 'Cert', {
    distinguishedName,
    pemCertificate: 'asdf',
    secretEncryptionKey: key,
    baseName: 'Sekrit',
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('Custom::RsaPrivateKeySecret', {
    SecretName: 'Sekrit/RSAPrivateKey',
  });
});
