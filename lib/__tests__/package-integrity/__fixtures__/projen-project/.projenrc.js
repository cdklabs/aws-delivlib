const { JsiiProject } = require('projen');
const project = new JsiiProject({
  release: false,
  buildWorkflow: false,
  defaultReleaseBranch: 'main',
  name: 'projen-project',
  testdir: 'src/__tests__',
  srcdir: 'src',
  publishToPypi: {
    distName: 'projen-project',
    module: 'projen_project'
  }
});
project.synth();


