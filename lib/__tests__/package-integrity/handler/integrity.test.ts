import { NpmIntegrity } from '../../../package-integrity/handler/integrity';

describe('NpmIntegrity', () => {

  const integrity = new NpmIntegrity();

  describe('parse', () => {

    test('non jsii yarn artifact', () => {
      const pkg = integrity.parse('cdk8s-cli-v1.0.0-beta.59.tgz');
      expect(pkg.name).toEqual('cdk8s-cli');
      expect(pkg.version).toEqual('1.0.0-beta.59');
    });

    test('non jsii npm artifact', () => {
      const pkg = integrity.parse('cdk8s-cli-1.0.0-beta.59.tgz');
      expect(pkg.name).toEqual('cdk8s-cli');
      expect(pkg.version).toEqual('1.0.0-beta.59');
    });

    test('jsii artifcat', () => {
      const pkg = integrity.parse('cdk8s@1.0.0-beta.59.jsii.tgz');
      expect(pkg.name).toEqual('cdk8s');
      expect(pkg.version).toEqual('1.0.0-beta.59');
    });

  });

  describe('validate', () => {

    test('non jsii yarn artifact', () => {


    });
  });


});