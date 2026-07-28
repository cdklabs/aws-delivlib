const path = require('path');
const { typescript } = require('projen');

// see https://github.com/projen/projen/issues/1356
const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'projen-non-jsii-project',
  author: 'dummy',
  authorAddress: 'dummy@example.com',
  repositoryUrl: 'dummy',
  projenVersion,
  // Cap TypeScript below 7. Without this, projen generates "typescript": "*"
  // for this scaffolded project, which resolves TypeScript 7.x at test time.
  // TS 7 is incompatible with the test toolchain (ts-jest peer "typescript <7",
  // @typescript-eslint peer "typescript <6.1.0"), causing the package-integrity
  // build to fail. Pin to a supported line so the nested build is deterministic.
  typescriptVersion: '~5.8.0',
  tsconfigDev: {
    compilerOptions: {
      types: ['jest', 'node'],
    },
  },
});

project.package.addField('private', true);

project.synth();

