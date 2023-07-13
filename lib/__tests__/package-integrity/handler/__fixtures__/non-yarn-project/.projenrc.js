const path = require('path');
const { cdk, javascript } = require('projen');

// see https://github.com/projen/projen/issues/1356
const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;

const project = new cdk.JsiiProject({
  defaultReleaseBranch: 'main',
  name: 'non-yarn-project',
  author: 'dummy',
  authorAddress: 'dummy@example.com',
  repositoryUrl: 'dummy',
  projenVersion,
  packageManager: javascript.NodePackageManager.NPM,
  jsiiVersion: '^5'
});

project.package.addField('private', true);

project.synth();

