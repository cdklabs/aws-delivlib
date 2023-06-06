import { typescript } from 'projen';

const project = new typescript.TypeScriptProject({
  name: 'aws-delivlib',
  projenrcTs: true,
  description: 'A fabulous library for defining continuous pipelines for building, testing and releasing code libraries.',
  repository: 'https://github.com/cdklabs/aws-delivlib.git',
  defaultReleaseBranch: 'main',
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  minNodeVersion: '16.14.0',
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
    'node-ical@0.15.1', // need to pin due to https://github.com/axios/axios/issues/5101
    'rrule',
    'esbuild',
    'fs-extra',
    'tar',
    'adm-zip',
    'JSONStream',
    'follow-redirects',
    'minipass@3.2.1', // temporary (hopefully) workaround for https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/60901
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

// Run yarn install in the github publisher directory
const buildGithubPublisher = project.addTask('build:publishing/github');
buildGithubPublisher.exec('yarn install --frozen-lockfile', { cwd: 'lib/publishing/github' });
buildGithubPublisher.exec('yarn tsc --build', { cwd: 'lib/publishing/github' });
project.compileTask.prependSpawn(buildGithubPublisher);
// Exclude the publisher from the root tsconfig, but add a reference to it
project.tsconfig?.addExclude('lib/publishing/github');
project.tsconfig?.file.addOverride('references', [{ path: 'lib/publishing/github' }]);

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
    '--target="node14"',
    '--platform="node"',
    '--outfile="lib/package-integrity/handler/validate.bundle.js"',
    '--sourcemap=inline',
  ].join(' '),
});

project.compileTask.spawn(bundlePackageIntegrity);

// The npmignore file includes original source files, which is undesirable.
project.npmignore?.exclude(
  '/lib/**/*.ts',
);
project.npmignore?.include(
  '/lib/**/*.d.ts',
  '/lib/**/node_modules/**',
);
// Also includes other undesirable assets.
project.npmignore?.exclude(
  '/lib/__tests__/',
  'tsconfig.json',
  'tsconfig.dev.json',
  'tsconfig.tsbuildinfo',
  '/build-*.sh',
  'cdk.out/',
  'cdk.json',
);

project.synth();
