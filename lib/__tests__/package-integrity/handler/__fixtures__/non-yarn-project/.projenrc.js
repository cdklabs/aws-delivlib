const path = require('path');
const { JsiiProject, NodePackageManager } = require('projen');

// see https://github.com/projen/projen/issues/1356
const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;

const project = new JsiiProject({
  defaultReleaseBranch: 'main',
  name: 'non-yarn-project',
  author: 'dummy',
  authorAddress: 'dummy@example.com',
  repositoryUrl: 'dummy',
  projenVersion,
  packageManager: NodePackageManager.NPM
});

project.package.addField('private', true);

project.synth();

