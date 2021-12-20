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
});

project.package.addField('private', true);

project.synth();

