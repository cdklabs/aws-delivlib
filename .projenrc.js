const { typescript: { TypeScriptProject } } = require('projen');

const project = new TypeScriptProject({
  name: 'aws-delivlib',
  description: 'A fabulous library for defining continuous pipelines for building, testing and releasing code libraries.',
  repository: 'https://github.com/cdklabs/aws-delivlib.git',
  defaultReleaseBranch: 'main',
  projenUpgradeSecret: 'PROJEN_GITHUB_TOKEN',
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  keywords: [
    'aws-cdk',
    'continuous-delivery',
    'continuous-integration',
    'ci-cd',
  ],
  deps: ['changelog-parser'],
  devDeps: [
    '@monocdk-experiment/assert',
    '@types/aws-lambda',
    '@types/fs-extra',
    '@types/tar',
    '@types/adm-zip',
    'aws-cdk',
    'jest-create-mock-instance',
    'constructs',
    'monocdk',
    'standard-version',
    'ts-jest',
    'typescript',
    'aws-sdk',
    'node-ical',
    'rrule',
    'esbuild',
    'fs-extra',
    'tar',
    'adm-zip',
    'JSONStream',
  ],
  peerDeps: [
    'constructs',
    'monocdk',
  ],
  srcdir: 'lib',
  testdir: 'lib/__tests__',

  pullRequestTemplate: false,
  autoApproveOptions: {
    allowedUsernames: ['cdklabs-automation'],
    secret: 'GITHUB_TOKEN',
  },
  autoApproveUpgrades: true,

  releaseToNpm: true,
});

// trick projen so that it doesn't override the version in package.json
project.tasks.addEnvironment('RELEASE', '1');

project.gitignore.exclude('cdk.out');
project.gitignore.exclude('pipeline/*.js');
project.gitignore.exclude('pipeline/*.d.ts');
project.setScript('cdk', 'npx cdk');

const integDiff = project.addTask('integ:diff');
integDiff.exec('/bin/bash ./lib/__tests__/run-test.sh');

const integUpdate = project.addTask('integ:update');
integUpdate.exec('/bin/bash ./lib/__tests__/run-test.sh update');

project.testTask.spawn(integDiff);

const compileCustomResourceHandlers = project.addTask('compile:custom-resource-handlers');
compileCustomResourceHandlers.exec('/bin/bash ./build-custom-resource-handlers.sh');

project.compileTask.prependSpawn(compileCustomResourceHandlers);

project.gitignore.include('lib/package-integrity/handler/JSONStream.d.ts');
const bundlePackageIntegrity = project.addTask('bundle:package-integrity', {
  description: 'Bundle the package integrity script',
  exec: [
    'esbuild',
    '--bundle',
    'lib/package-integrity/handler/validate.js',
    '--target="node12"',
    '--platform="node"',
    '--outfile="lib/package-integrity/handler/validate.bundle.js"',
    '--sourcemap=inline',
  ].join(' '),
});

project.compileTask.spawn(bundlePackageIntegrity);

project.synth();
