const { typescript, javascript } = require('projen');

const project = new typescript.TypeScriptProject({
  name: 'aws-delivlib',
  description: 'A fabulous library for defining continuous pipelines for building, testing and releasing code libraries.',
  repository: 'https://github.com/cdklabs/aws-delivlib.git',
  defaultReleaseBranch: 'main',
  projenUpgradeSecret: 'PROJEN_GITHUB_TOKEN',
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  minNodeVersion: '14.17.0',
  keywords: [
    'aws-cdk',
    'continuous-delivery',
    'continuous-integration',
    'ci-cd',
  ],
  deps: ['changelog-parser'],
  depsUpgradeOptions: {
    exclude: ['aws-cdk-lib', 'constructs'],
  },
  devDeps: [
    '@types/aws-lambda',
    '@types/fs-extra',
    '@types/tar',
    '@types/adm-zip',
    '@types/follow-redirects',
    'aws-cdk',
    'jest-create-mock-instance',
    'constructs',
    'aws-cdk-lib',
    'standard-version',
    'ts-jest',
    'typescript',
    'aws-sdk',
    'aws-sdk-mock',
    'node-ical',
    'rrule',
    'esbuild',
    'fs-extra',
    'tar',
    'adm-zip',
    'JSONStream',
    'follow-redirects',
  ],
  peerDeps: [
    'constructs',
    'aws-cdk-lib',
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

// Need to run with UTC TZ, or else node-ical does very wrong things with timestamps and fails tests...
project.testTask.env('TZ', 'UTC');
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
