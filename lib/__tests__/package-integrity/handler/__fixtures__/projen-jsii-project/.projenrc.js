const path = require('path');
const { cdk } = require('projen');

// see https://github.com/projen/projen/issues/1356
const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;

const project = new cdk.JsiiProject({
  defaultReleaseBranch: 'main',
  name: 'projen-jsii-project',
  publishToPypi: {
    distName: 'projen-jsii-project',
    module: 'projen_jsii_project',
  },
  author: 'dummy',
  authorAddress: 'dummy@example.com',
  repositoryUrl: 'dummy',
  projenVersion,
  jsiiVersion: '^5',
  // Pin the test toolchain. projen otherwise generates "typescript": "*",
  // "jest": "*" and "ts-jest": "*", which resolve the latest published
  // versions at test time. TypeScript 7.x now resolves via "*" and is
  // incompatible with ts-jest 29 (peer typescript ">=4.3 <6"), crashing with
  // "Cannot read properties of undefined (reading 'readFile')". Pin to a
  // compatible combination so this scaffolded project builds deterministically.
  typescriptVersion: '~5.8.0',
  jestOptions: { jestVersion: '^29' },
  devDeps: ['ts-jest@^29'],
  tsconfigDev: {
    compilerOptions: {
      types: ['jest', 'node'],
    },
  },
});

project.package.addField('private', true);

project.synth();
