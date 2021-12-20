const path = require('path');
const { JsiiProject } = require('projen');

// see https://github.com/projen/projen/issues/1356
const projenVersion = require(path.join(require.resolve('projen'), '..', '..', 'package.json')).version;

const project = new JsiiProject({
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
});

project.package.addField('private', true);

project.synth();

