## aws-delivlib

[![experimental](http://badges.github.io/stability-badges/dist/experimental.svg)](http://github.com/badges/stability-badges)

**aws-delivlib** is a fabulous library for defining continuous pipelines for
building, testing and publishing code libraries through AWS CodeBuild and AWS
CodePipeline.

**aws-delivlib** is used by the [AWS Cloud Development Kit](https://github.com/awslabs/aws-cdk) and was
designed to support simultaneous delivery of the AWS CDK in multiple programming languages
packaged via [jsii](https://github.com/awslabs/jsii).

## Pipeline Structure

A delivlib pipeline consists of the following sequential stages. Each stage will
execute all tasks concurrently:

```
+-----------+     +-----------+     +-----------+     +----------------+
|  Source   +---->+   Build   +---->+   Test    +---->+    Publish     |
+-----------+     +-----------+     +-----+-----+     +-------+--------+
                                          |                   |
                                          v                   v
                                    +-----+-----+     +-------+-------+
                                    |   Test1   |     |      npm      |
                                    +-----------+     +---------------+
                                    |   Test2   |     |     NuGet     |
                                    +-----------+     +---------------+
                                    |   Test3   |     | Maven Central |
                                    +-----------+     +---------------+
                                    |    ...    |     |     PyPI      |
                                    +-----------+     +---------------+
                                                      |  GitHub Pages |
                                                      +---------------+
                                                      |GitHub Releases|
                                                      +---------------+
```

The following sections describe each stage and the configuration options
available:

1. [Source](#source)
   - [CodeCommit](#codecommit)
   - [GitHub](#github)
1. [Pull Request Builds](#pull-request-builds)
1. [Build](#build)
1. [Tests](#tests)
1. [Publish](#publish)
   - [npm.js](#npmjs)
   - [NuGet](#nuget)
   - [Maven Central](#maven-central)
   - [PyPi](#pypi)
   - [GitHub Releases](#github-releases)
   - [GitHub Pages](#github-pages)
1. [Automatic Bumps and Pull Request Builds](#automatic-bumps-and-pull-request-builds)
1. [Failure Notifications](#failure-notifications)
1. [ECR Registry Sync](#ecr-registry-sync)


## Installation

To install, use npm / yarn:

```console
$ npm i aws-delivlib
```

or:

```console
$ yarn add aws-delivlib
```

and import the library to your project:

```ts
import delivlib = require('aws-delivlib');
```

The next step is to add a pipeline to your app. When you define a pipeline, the
minimum requirement is to specify the source repository. All other settings are
optional.

```ts
const pipeline = new delivlib.Pipeline(this, 'MyPipeline', {
  // options
});
```

The following sections will describe the various options available in your
pipeline.

You can also take a look at the
[pipeline definition releasing the delivlib library itself](pipeline/delivlib.ts)
for a real-world, working example.

## Source

The only required option when defining a pipeline is to specify a source
repository for your project.

### `repo`: Source Repository (required)

The `repo` option specifies your source code repository for your project. You
could use either CodeCommit or GitHub.

#### CodeCommit

To use an existing repository:

```ts
import codecommit = require('@aws-cdk/aws-codecommit');

// import an existing repository
const myRepo = codecommit.Repository.fromRepositoryName(this, 'TestRepo',
  'delivlib-test-repo');

// ...or define a new repository (probably not what you want)
const myRepo = new codecommit.Repository(this, 'TestRepo');

// create a delivlib pipeline associated with this codebuild repo
new delivlib.Pipeline(this, 'MyPipeline', {
  repo: new delivlib.CodeCommitRepo(myRepo),
  // ...
});
```

#### GitHub

To connect to GitHub, you will need to store a [Personal GitHub Access
Token](https://github.com/settings/tokens) as an SSM Parameter and provide the
name of the SSM parameter.

```ts
import cdk = require('@aws-cdk/core');

new delivlib.Pipeline(this, 'MyPipeline', {
  repo: new delivlib.GitHubRepo({
    repository: 'awslabs/aws-delivlib',
    token: cdk.SecretValue.secretsManager('my-github-token'),
  }),
  // ...
})
```

### `branch`: Source Control Branch (optional)

The `branch` option can be used to specify the git branch to build from. The
default is `master`.

```ts
new delivlib.Pipeline(this, 'MyPipeline', {
  repo: // ...
  branch: 'dev',
})
```

## Pull Request Builds

Pull Request Builds can be used to validate if changes submitted via a pull request
successfully build and pass tests. They are triggered automatically by GitHub or
CodeCommit when pull requests are submitted or updated.

Known in delivlib as AutoBuild, they can be enabled on the Pipeline and further
configured -

```ts
new delivlib.Pipeline(this, 'MyPipeline', {
  // ...
  autoBuild: true,
  autoBuildOptions: {
    publicLogs: true,
  },
});
```

Delivlib also separately exports the `AutoBuild` construct that can be used to configure
AutoBuild on a project that doesn't have a pipeline associated, or for jobs that can be
run outside of a pipeline.

```ts
new delivlib.AutoBuild(this, 'MyAutoBuild', {
  repo: // ...
});
```

## Build

The second stage of a pipeline is to build your code. The following options
allow you to do customize your build environment and scripts:

### `buildSpec`: Build Script (optional)

The default behavior will use the `buildspec.yaml` file from the root of your
source repository to determine the build steps.

See the the [buildspec reference documentation](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html)
in the CodeBuild User Guide.

Note that if you don't have an "__artifacts__" section in your buildspec, you won't
be able to run any tests against the build outputs or publish them to package
managers.

If you wish, you can use the `buildSpec` option, in which case CodeBuild will not
use the checked-in `buildspec.yaml`:

```ts
import codebuild = require('@aws-cdk/aws-codebuild');

new delivlib.Pipeline(this, 'MyPipeline', {
  // ...
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      build: {
        commands: [
          'echo "Hello, world!"'
        ]
      }
    },
    artifacts: {
      files: [ '**/*' ],
      'base-directory': 'dist'
    }
  }),
});
```

### `buildImage`: Build container image (optional)

The Docker image to use for the build container.

Default: the default image (if none is specified) is a custom Docker image which
is provided as part of the [jsii] distribution called [jsii/superchain]. It is
an environment that supports building libraries that target all programming
languages supported by [jsii]. Find more information on the contents of the
[jsii/superchain] image on the [jsii] homepage.

[jsii]: https://github.com/aws/jsii
[jsii/superchain]: https://hub.docker.com/r/jsii/superchain

You can use the AWS CodeBuild API to specify any Linux/Windows Docker image for
your build. Here are some examples:

* `codebuild.LinuxBuildImage.fromDockerRegistry('golang:1.11')` - use an image from Docker Hub
* `codebuild.LinuxBuildImage.UBUNTU_14_04_OPEN_JDK_9` - OpenJDK 9 available from AWS CodeBuild
* `codebuild.WindowsBuildImage.WIN_SERVER_CORE_2016_BASE` - Windows Server Core 2016 available from AWS CodeBuild
* `codebuild.LinuxBuildImage.fromEcrRepository(myRepo)` - use an image from an ECR repository

### `env`: Build environment variables (optional)

Allows adding environment variables to the build environment:

```ts
new delivlib.Pipeline(this, 'MyPipeline', {
  // ...
  environment: {
    FOO: 'bar'
  }
});
```

### Other Build Options

* `computeType`: size of the AWS CodeBuild compute capacity (default: SMALL)
* `privileged`: run in privileged mode (default: `false`)

## Tests

The third stage of a delivlib pipeline is to execute tests. Tests are executed
in parallel only after a successful build and can access build artifacts as
defined in your `buildspec.yaml`.

The `pipeline.addTest` method can be used to add tests to your pipeline. Test
scripts are packaged as part of your delivlib CDK app.

```ts
delivlib.addTest('MyTest', {
  platform: delivlib.ShellPlatform.LinuxUbuntu(), // or `ShellPlatform.Windows()`
  scriptDirectory: 'path/to/local/directory/with/tests',
  entrypoint: 'run.sh',
});
```

`scriptDirectory` refers to a directory on the local file system which must
contain the `entrypoint` file.
Preferably make this path relative to the current file using `path.join(__dirname, ...)`.

The test container will be populated the build output artifacts as well as all
the files from the test directory.

Then, the entry-point will be executed. If it fails, the test failed.

## Publish

The last step of the pipeline is to publish your artifacts to one or more
package managers. Delivlib is shipped with a bunch of built-in publishing
tasks, but you could add your own if you like.

To add a publishing target to your pipeline, you can either use the
`pipeline.addPublish(publisher)` method or one of the built-in
`pipeline.publishToXxx` methods. The first option is useful if you wish to
define your own publisher, which is class the implements the
`delivlib.IPublisher` interface.

Built-in publishers are designed to be idempotent: if the artifacts version is
already published to the package manager, the publisher __will succeed__. This
means that in order to publish a new version, all you need to do is bump the
version of your package artifact (e.g. change `package.json`) and the publisher
will kick in.

You can use the `dryRun: true` option when creating a publisher to tell the
publisher to do as much as it can without actually making the package publicly
available. This is useful for testing.

The following sections describe how to use each one of the built-in publishers.

### npm.js (JavaScript)

The method `pipeline.publishToNpm` will add a publisher to your pipeline which
can publish JavaScript modules to [npmjs](https://www.npmjs.com/).

The publisher will search for `js/*.tgz` in your build artifacts and will `npm
publish` each of them.

To create npm tarballs, you can use `npm pack` as part of your build and emit
them to the `js/` directory in your build artifacts. The version of the module
is deduced from the name of the tarball.

To use this publisher, you will first need to store an [npm.js publishing
token](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) in AWS
Secrets Manager and supply the secret ARN when you add the publisher.

```ts
pipeline.publishToNpm({
  npmTokenSecret: { secretArn: 'my-npm-token-secret-arn' }
});
```

### NuGet (.NET)

This publisher can publish .NET NuGet packages to [nuget.org](https://www.nuget.org/).

The publisher will search `dotnet/**/*.nuget` in your build artifacts and will
publish each package to NuGet. To create .nupkg files, see [Creating NuGet
Packages](https://docs.microsoft.com/en-us/nuget/create-packages/creating-a-package).
Make sure you output the artifacts under the `dotnet/` directory.

To use this publisher, you will first need to store a [NuGet API
Key](https://www.nuget.org/account/apikeys) with "Push" permissions in AWS
Secrets Manager and supply the secret ARN when you add the publisher.

Use `pipeline.publishToNuGet` will add a publisher to your pipeline:

```ts
pipeline.publishToNuGet({
  nugetApiKeySecret: { secretArn: 'my-nuget-token-secret-arn' }
});
```

#### Assembly Signature

**Important:** Limitations in the `mono` tools restrict the hash algorithms that
can be used in the signature to `SHA-1`. This limitation will be removed in the
future.

You can enable digital signatures for the `.dll` files enclosed in your NuGet
packages. In order to do so, you need to procure a Code-Signing Certificate
(also known as a Software Publisher Certificate, or SPC). If you don't have one
yet, you can refer to
[Obtaining a new Code Signing Certificate](#obtaining-a-new-code-signing-certificate)
for a way to create a new certificate entirely in the Cloud.

In order to enable code signature, change the way the NuGet publisher is added
by adding an `ICodeSigningCertificate` for the `codeSign` key (it could be a
`CodeSigningCertificate` construct, or you may bring your own implementation if
you wish to use a pre-existing certificate):

```ts
pipeline.publishToNuGet({
  nugetApiKeySecret: { secretArn: 'my-nuget-token-secret-arn' },
  codeSign: codeSigningCertificate
});
```

##### Obtaining a new Code Signing Certificate

If you want to create a new certificate, the `CodeSigningCertificate` construct
will provision a new RSA Private Key and emit a Certificate Signing Request in
an `Output` so you can pass it to your Certificate Authority (CA) of choice:
1. Add a `CodeSigningCertificate` to your stack:
    ```ts
    new delivlib.CodeSigningCertificate(stack, 'CodeSigningCertificate', {
      distinguishedName: {
        commonName: '<a name your customers would recognize>',
        emailAddress: '<your@email.address>',
        country: '<two-letter ISO country code>',
        stateOrProvince: '<state or province>',
        locality: '<city>',
        organizationName: '<name of your company or organization>',
        organizationalUnitName: '<name of your department within the origanization>',
      }
    });
    ```
2. Deploy the stack:
    ```console
    $ cdk deploy $stack_name
    ...
    Outputs:
    $stack_name.CodeSigningCertificateXXXXXX = -----BEGIN CERTIFICATE REQUEST-----
    ...
    -----END CERTIFICATE REQUEST-----
    ```
3. Forward the Certificate Signing Request (the value of the stack output that
   starts with `-----BEGIN CERTIFICATE REQUEST-----` and ends with
   `-----END CERTIFICATE REQUEST-----`) to a Certificate Authority, so they can
   provde you with a signed certificate.
4. Update your stack with the signed certificate obtained from the CA. The below
   example assumes you palced the PEM-encoded certificate in a file named
   `certificate.pem` that is in the same folder as file that uses the code:
    ```ts
    // Import utilities at top of file:
    import fs = require('fs');
    import path = require('path');
    // ...
    new delivlib.CodeSigningCertificate(stack, 'CodeSigningCertificate', {
      distinguishedName: {
        commonName: '<a name your customers would recognize>',
        emailAddress: '<your@email.address>',
        country: '<two-letter ISO country code>',
        stateOrProvince: '<state or province>',
        locality: '<city>',
        organizationName: '<name of your company or organization>',
        organizationalUnitName: '<name of your department within the origanization>',
      },
      // Addin the signed certificate
      pemCertificate: fs.readFileSync(path.join(__dirname, 'certificate.pem'))
    });
    ```
5. Redeploy your stack, so the self-signed certificate is replaced with the one
   received from your CA:
    ```console
    $ cdk deploy $stackName
    ```

### Maven Central (Java)

This publisher can publish Java packages to [Maven
Central](https://search.maven.org/).

This publisher expects to find a local maven repository under the `java/`
directory in your build output artifacts. You can create one using the
`altDeploymentRepository` option for `mvn deploy` (this assumes `dist` if the
root of your artifacts tree):

```console
$ mvn deploy -D altDeploymentRepository=local::default::file://${PWD}/dist/java
```

Use `pipeline.publishToMaven` to add this publisher to your pipeline:

```ts
pipeline.publishToMaven({
  mavenLoginSecret: { secretArn: 'my-maven-credentials-secret-arn' },
  signingKey: mavenSigningKey,
  stagingProfileId: '11a33451234521'
});
```

In order to configure the Maven publisher, you will need at least three pieces
of information:

1. __Maven Central credentials__ (`mavenLoginSecret`) stored in AWS Secrets Manager
2. __GPG signing key__ (`signingKey`) to sign your Maven packages
3. __Staging profile ID__ (`stagingProfileId`) assigned to your account in Maven Central.

The following sections will describe how to obtain this information.

#### GPG Signing Key

Since Maven Central requires that you sign your packages you will need to
create a GPG key pair and publish it's public key to a well-known server:

This library includes a GPG key construct:

```ts
const mavenSigningKey = new delivlib.OpenPGPKeyPair(this, 'MavenCodeSign', {
  email: 'your-email@domain.com',
  identity: 'your-identity',
  secretName: 'maven-code-sign',
  pubKeyParameterName: 'mavenPublicKey',
  keySizeBits: 4096,
  expiry: '1y',
  version: 1.0
});
```

After you've deployed your stack once, you can go to the SSM Parameter Store
console and copy the public key from the new parameter created by your stack
under the specified secret name. Then, you should paste this key to any of the
supported key servers (recommended: https://keyserver.ubuntu.com).

#### Sonatype Credentials

In order to publish to Maven Central, you'll need to follow the instructions in
Maven Central's [OSSRH Guide](http://central.sonatype.org/pages/ossrh-guide.html)
and create a Sonatype account and project via JIRA:

1. [Create JIRA
   account](https://issues.sonatype.org/secure/Signup!default.jspa)
2. [Create new project
   ticket](https://issues.sonatype.org/secure/CreateIssue.jspa?issuetype=21&pid=10134)
3. Once you have the user name and password of your Sonatype account, create an
   AWS Secrets Manager secret with a `username` and `password` key/value fields
   that correspond to your account's credentials.

#### Staging Profile ID

After you've obtained a Sonatype account and Maven Central project:

1. Log into https://oss.sonatype.org
2. Select "Staging Profiles" from the side bar (under "Build Promotion")
3. Click on the "Releases" staging profile that you registered
4. The URL of the page should change and include your profile ID. For example: `https://oss.sonatype.org/#stagingProfiles;11a33451234521`

This is the value you should assign to the `stagingProfileId` option.

### PyPI (Python)

This publisher can publish modules to [PyPI](https://pypi.org/).

This publisher will publish all files under the `python/` directory in your
build output artifacts to PyPI using the following command:

```sh
twine upload --skip-existing python/**
```

To use this publisher, you will need to an
[account](https://pypi.org/account/register/) with PyPI. Then store your
credentials in an AWS Secrets Manager secret, under the `username` and
`password` fields.

Now, use `pipeline.publishToPyPi` to add this publisher to your pipeline:

```ts
pipeline.publishToPyPi({
  loginSecret: { secretArn: 'my-pypi-credentials-secret-arn' }
});
```

### GitHub Releases

This publisher can package all your build artifacts, sign them and publish them
to the "Releases" section of a GitHub project.

This publisher relies on two files to produce the release:

- `build.json` a manifest that contains metadata about the release.
- `CHANGELOG.md` (optional) the changelog of your project, from which the
  release notes are extracted. If not provided, no release notes are added
  to the release.

<a id="manifest"/>

The file `build.json` is read from the root of your artifact tree. It should
include the following fields:

```json
{
  "name": "<project name>",
  "version": "<project version>",
  "commit": "<sha of commit>"
}
```

This publisher does the following:

1. Create a zip archive that contains the entire build artifacts tree under the
   name `${name}-${version}.zip`.
2. Sign the archive using a GPG key and store it under
   `${name}-${version}.zip.sig`
3. Check if there is already a git tag with `v${version}` in the GitHub
   repository. If there is, bail out successfully.
4. If there's a `CHANGELOG.md` file, and extract the release notes for
   `${version}` (uses [changelog-parser](https://www.npmjs.com/package/changelog-parser))
5. Create a GitHub release named `v${version}`, tag the specified `${commit}`
   with the release notes from the changelog.
6. Attach the zip archive and signature to the release.

To add a GitHub release publisher to your pipeline, use the
`pipeline.publishToGitHub` method:

```ts
pipeline.publishToGitHub({
  githubRepo: targetRepository,
  signingKey: releaseSigningKey
});
```

The publisher requires the following information:

- The target GitHub project (`githubRepo`): see [instructions](#github) on how to connect
  to a GitHub repository. It doesn't have to be the same repository as the source repository,
  but it can be.
- A GPG signing key (`signingKey`): a `delivlib.SigningKey` object used to sign the
  zip bundle. Make sure to publish the public key to a well-known server so your users
  can validate the authenticity of your release (see [GPG Signing Key](#gpg-signing-key) for
  details on how to create a signing key pair and extract it's public key). You can either use

### GitHub Pages

This publisher allows you to publish versioned static web-site content to GitHub Pages.

The publisher commits the entire contents of the `docs/` directory into the root of the specified
GitHub repository, and also under the `${version}/` directory of the repo (which allows users
to access old versions of the docs if they wish).

NOTE: static website content can grow big. Therefore, this publisher will always force-push
to the branch without history (history is preserved via the `versions/` directory). Make sure
you don't protect this branch against force-pushing or otherwise the publisher will fail.

This publisher depends on the following artifacts:

1. `build.json`: build manifest (see [schema](#manifest) above)
2. `docs/**`: the static website contents

This is how this publisher works:

1. Read the `version` field from `build.json`
2. Clone the `gh-pages` branch of the target repository to a local working directory
3. Rsync the contents of `docs/**` both to `versions/${version}` and to `/` of the working copy.
5. Commit and push to the `gh-pages` branch on GitHub

> NOTE: if `docs/` contains a fully rendered static website, you should also include
> a `.nojekyll` file to [bypass](https://blog.github.com/2009-12-29-bypassing-jekyll-on-github-pages/)
> Jekyll rendering.

To add this publisher to your pipeline, use the `pipeline.publishToGitHubPages` method:

```ts
pipeline.publishToGitHubPages({
  githubRepo,
  sshKeySecret: { secretArn: 'github-ssh-key-secret-arn' },
  commitEmail: 'foo@bar.com',
  commitUsername: 'foobar',
  branch: 'gh-pages' // default
});
```

In order to publish to GitHub Pages, you will need the following pieces of information:

1. The target GitHub repository (`githubRepo`). See [instructions](#github) on
   how to connect to a GitHub repository. It doesn't have to be the same
   repository as the source repository, but it can be.
2. SSH private key (`sshKeySecret`) for pushing to that repository stored in AWS
   Secrets Manager which is configured in your GitHub repository as a deploy key
   with write permissions.
3. Committer email (`commitEmail`) and username (`commitUsername`).

To create an ssh deploy key for your repository:

1. Follow [this
   guide](https://developer.github.com/v3/guides/managing-deploy-keys/#deploy-keys)
   to produce a private/public key pair on your machine.
1. Add the deploy key to your repository with write permissions.
1. Create an AWS Secrets Manager secret and paste the private key as plaintext
   (not key/value).
1. Use the name of the AWS Secrets Manager secret in the `sshKeySecret` option.

## Automatic Bumps and Pull Request Builds

### GitHub Access

If your source repository is GitHub, in order to enable these features you will
need to manually connect AWS CodeBuild to your GitHub account. Otherwise, you
will receive the following error message:

```
No Access token found, please visit AWS CodeBuild console to connect to GitHub
(Service: AWSCodeBuild; Status Code: 400; Error Code: InvalidInputException;
Request ID: ab458603-6fd4-11e8-9310-ff116e0423f9)
```

To connect, go to the AWS CodeBuild console, click "Create Project", select a
GitHub source and hit "Connect". There is no need to save the new project. This
needs to be done once per account/region.

### Automatic Bumps

A bump is the process of incrementing the version number of the project. When
the version number is incremented and a commit is pushed to the master branch,
the publishing actions will release the new version to all repositories.

This feature enables achieving full continuous delivery for libraries.

To enable automatic bumps, you will first need to determine how to perform a
bump in your repository. What command should be executed in order to increment
the version number, update change log, etc.

The bump command is expected to perform the bump and issue a **commit** and a
**tag** to the local repository with the version number.

For JavaScript projects, the
[standard-version](https://github.com/conventional-changelog/standard-version)
tool will do exactly that, so it is the recommended mechanism for such projects.

Once a bump is committed, the commit will be pushed either to a dedicated branch
called `bumps/VERSION` or to a branch of your choosing such as `master`.

To set up bumps, simply call `autoBump` on your pipeline. The following example
sets up a bump on the default schedule (12pm UTC daily) which will automatically
push the to "master" (which will trigger a release).

```ts
const bump = pipeline.autoBump({
  bumpCommand: 'npm i && npm run bump',
  branch: 'master'
});
```

You can customize the environment used for running the bump script.

If a bump fails, the `bump.alarm` CloudWatch alarm will be triggered.

NOTE: there is currently no way for the bump command to indicate to the
system that a bump is not needed (i.e. no changes have been made to the
library).

## Failure Notifications

Pipelines can be configured with notifications that will be sent on any failure in pipeline's stages. Notifications can
be sent to either a Slack channel or a Chime room. The following code configures one of each -

```ts
// Slack
const teamChannel = new chatbot.SlackChannelConfiguration(this, {
  // ...
});
pipeline.notifyOnFailure(PipelineNotification.slack({
  channels: [teamChannel]
}));

// Chime
const teamRoomWebhook = 'https://hooks.chime.aws/incomingwebhooks/1c3588c7-623d-4799-af9b-8b1818fca779?token=cUMzOVA4OXl8MXxCaHJlZ0RUVm03TmZVMkpoTzlwa3NVbXJCam8tNWF3UGdzemVqZndsZERV';
pipeline.notifyOnFailure(PipelineNotification.chime({
  webhookUrl: [ teamRoomWebhook ]
}));
```

## ECR Registry Sync

Builds commonly use Docker images, and these typically come from DockerHub. However, DockerHub has recently
introduced throttles on their pulls. This causes CodeBuild jobs on high throughput repositories to be throttled.

The `EcrRegistrySync` construct can be used to synchronize Docker images between DockerHub and a private ECR
registry in the AWS account.

```ts
const registry = `${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com`;

new EcrRegistrySync(this, 'RegistrySync', {
  ecrRegistry: registry,
  images: ImageSource.fromDockerHub([
    'python:3.6',
    'jsii/superchain'
  ]),
  dockerhubCreds: // ...
  schedule: events.Schedule.cron( ... ),
})
```

You can also use the `ImageSource.fromDirectory()` API if you would like to build a new Docker image based on a
Dockerfile. The Dockerfile should be placed at the top level of the specified directory.

## Contributing

See the [contribution guide](./CONTRIBUTING.md) for details on how to submit
issues, pull requests, setup a development environment and publish new releases
of this library.

## License

This library is licensed under the Apache 2.0 License.
