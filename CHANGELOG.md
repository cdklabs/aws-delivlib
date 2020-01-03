# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [5.0.0](https://github.com/awslabs/aws-delivlib/compare/v4.6.0...v5.0.0) (2020-01-03)


### ⚠ BREAKING CHANGES

* AutoBuildOptions.buildSpec is now of type codebuild.BuildSpec
* CanaryProps.scheduleExpression is now of type events.Schedule, and was renamed to 'schedule'
* ChangeControllerProps.scheduleExpression is now of type events.Schedule, and was renamed to 'schedule'
* RsaPrivateKeySecretProps.deletionPolicy has been renamed to 'removalPolicy'
* PipelineProps.buildSpec is now of type codebuild.BuildSpec
* GitHubRepo.tokenParameterName is now of type cdk.SecretValue, and was renamed to 'token'
* ShellableOptions.alarmPeriodSec is now of type cdk.Duration, and was renamed to 'alarmPeriod'

### Features

* migrate library to General Availability CDK version ([e6602c1](https://github.com/awslabs/aws-delivlib/commit/e6602c1))

## [4.6.0](https://github.com/awslabs/aws-delivlib/compare/v4.5.1...v4.6.0) (2019-12-11)


### Features

* migrate library to General Availability CDK version ([#184](https://github.com/awslabs/aws-delivlib/issues/184)) ([65a707d](https://github.com/awslabs/aws-delivlib/commit/65a707d))

### [4.5.1](https://github.com/awslabs/aws-delivlib/compare/v4.5.0...v4.5.1) (2019-10-26)

## [4.5.0](https://github.com/awslabs/aws-delivlib/compare/v4.4.4...v4.5.0) (2019-10-23)


### Features

* configure buildspec for AutoBuild project ([#169](https://github.com/awslabs/aws-delivlib/issues/169)) ([c9066f8](https://github.com/awslabs/aws-delivlib/commit/c9066f8))

### [4.4.4](https://github.com/awslabs/aws-delivlib/compare/v4.4.3...v4.4.4) (2019-10-17)

### [4.4.3](https://github.com/awslabs/aws-delivlib/compare/v4.4.2...v4.4.3) (2019-10-01)

### [4.4.2](https://github.com/awslabs/aws-delivlib/compare/v4.4.1...v4.4.2) (2019-09-30)

### [4.4.1](https://github.com/awslabs/aws-delivlib/compare/v4.4.0...v4.4.1) (2019-09-30)


### Bug Fixes

* **nuget:** migrate to snupkg symbols package format ([#153](https://github.com/awslabs/aws-delivlib/issues/153)) ([422c512](https://github.com/awslabs/aws-delivlib/commit/422c512))

## [4.4.0](https://github.com/awslabs/aws-delivlib/compare/v4.3.0...v4.4.0) (2019-09-23)


### Features

* **maven:** allow configuring Maven endpoint ([#151](https://github.com/awslabs/aws-delivlib/issues/151)) ([d659f9c](https://github.com/awslabs/aws-delivlib/commit/d659f9c))

## [4.3.0](https://github.com/awslabs/aws-delivlib/compare/v4.2.0...v4.3.0) (2019-09-13)


### Bug Fixes

* **bump:** add known_hosts before pushing to github ([047ca55](https://github.com/awslabs/aws-delivlib/commit/047ca55))


### Features

* auto-build (with public logs) ([4cbc8ab](https://github.com/awslabs/aws-delivlib/commit/4cbc8ab)), closes [#42](https://github.com/awslabs/aws-delivlib/issues/42)
* update "github-codebuild-logs" sar app to 1.0.4 ([1d0a90d](https://github.com/awslabs/aws-delivlib/commit/1d0a90d))

## 4.2.0 (2019-09-12)


### Features

* auto-build (with public logs) ([#146](https://github.com/awslabs/aws-delivlib/issues/146)) ([c3cac7e](https://github.com/awslabs/aws-delivlib/commit/c3cac7e)), closes [#42](https://github.com/awslabs/aws-delivlib/issues/42)

## [4.1.0](https://github.com/awslabs/aws-delivlib/compare/v4.0.0...v4.1.0) (2019-08-26)


### Features

* use mono's signcode to sign .NET assemblies ([#133](https://github.com/awslabs/aws-delivlib/issues/133)) ([630f3c6](https://github.com/awslabs/aws-delivlib/commit/630f3c6))

## [4.0.0](https://github.com/awslabs/aws-delivlib/compare/v3.9.5...v4.0.0) (2019-08-06)


### ⚠ BREAKING CHANGES

* The `Superchain` construct was removed. The default
build image was changed to `jsii/superchain` instead of being a bundled
image staged in an ECR registry.

### Features

* use `jsii/superchain` image instead of bundling own ([#121](https://github.com/awslabs/aws-delivlib/issues/121)) ([59aeb80](https://github.com/awslabs/aws-delivlib/commit/59aeb80)), closes [aws/jsii#653](https://github.com/aws/jsii/issues/653)

### [3.9.5](https://github.com/awslabs/aws-delivlib/compare/v3.9.4...v3.9.5) (2019-07-17)



### [3.9.4](https://github.com/awslabs/aws-delivlib/compare/v3.9.3...v3.9.4) (2019-07-16)



### [3.9.3](https://github.com/awslabs/aws-delivlib/compare/v3.9.2...v3.9.3) (2019-06-06)



## [3.9.2](https://github.com/awslabs/aws-delivlib/compare/v3.9.1...v3.9.2) (2019-06-04)



## [3.9.1](https://github.com/awslabs/aws-delivlib/compare/v3.9.0...v3.9.1) (2019-06-03)


### Bug Fixes

* Stop pulling GPG keys from the internets ([#96](https://github.com/awslabs/aws-delivlib/issues/96)) ([87db0da](https://github.com/awslabs/aws-delivlib/commit/87db0da))



# [3.9.0](https://github.com/awslabs/aws-delivlib/compare/v3.8.2...v3.9.0) (2019-05-29)


### Features

* **shellable:** support privileged mode ([#95](https://github.com/awslabs/aws-delivlib/issues/95)) ([2558c6e](https://github.com/awslabs/aws-delivlib/commit/2558c6e))



## [3.8.2](https://github.com/awslabs/aws-delivlib/compare/v3.8.0...v3.8.2) (2019-05-21)



# [3.8.1](https://github.com/awslabs/aws-delivlib/compare/v3.8.0...v3.8.1) (2019-05-20)

### Build

* Upgraded contents of Superchain Docker image


# [3.8.0](https://github.com/awslabs/aws-delivlib/compare/v3.7.0...v3.8.0) (2019-04-11)


### Features

* support npm disttags ([#91](https://github.com/awslabs/aws-delivlib/issues/91)) ([90aa1d0](https://github.com/awslabs/aws-delivlib/commit/90aa1d0))



<a name="3.7.1"></a>
# [3.7.1](https://github.com/awslabs/aws-delivlib/compare/v3.7.0...v3.7.1) (2019-04-11)


### Bug Fixes

* **nuget-sign:** Use  osslsigncode for now, so SHA256 signatures can be used ([#92](https://github.com/awslabs/aws-delivlib/pull/92)) ([e2855af](https://github.com/awslabs/aws-delivlib/commit/e2855af))



<a name="3.7.0"></a>
# [3.7.0](https://github.com/awslabs/aws-delivlib/compare/v3.6.3...v3.7.0) (2019-04-10)


### Features

* upgrade superchain to dotnet to 2.2.202 ([#87](https://github.com/awslabs/aws-delivlib/issues/87)) ([1b74842](https://github.com/awslabs/aws-delivlib/commit/1b74842))



<a name="3.6.3"></a>
## [3.6.3](https://github.com/awslabs/aws-delivlib/compare/v3.6.2...v3.6.3) (2019-04-09)


### Bug Fixes

* **autobump:** stop AutoBump from releasing 0 changes ([#89](https://github.com/awslabs/aws-delivlib/issues/89)) ([a271016](https://github.com/awslabs/aws-delivlib/commit/a271016))



<a name="3.6.2"></a>
## [3.6.2](https://github.com/awslabs/aws-delivlib/compare/v3.6.1...v3.6.2) (2019-04-09)



<a name="3.6.1"></a>
## [3.6.1](https://github.com/awslabs/aws-delivlib/compare/v3.6.0...v3.6.1) (2019-04-09)



<a name="3.6.0"></a>
# [3.6.0](https://github.com/awslabs/aws-delivlib/compare/v3.5.18...v3.6.0) (2019-04-09)


### Features

* shellable alarm configuration ([#88](https://github.com/awslabs/aws-delivlib/issues/88)) ([4beddad](https://github.com/awslabs/aws-delivlib/commit/4beddad)), closes [awslabs/cdk-ops#329](https://github.com/awslabs/cdk-ops/issues/329)



<a name="3.5.18"></a>
## [3.5.18](https://github.com/awslabs/aws-delivlib/compare/v3.5.17...v3.5.18) (2019-04-08)



<a name="3.5.17"></a>
## [3.5.17](https://github.com/awslabs/aws-delivlib/compare/v3.5.16...v3.5.17) (2019-04-07)



<a name="3.5.16"></a>
## [3.5.16](https://github.com/awslabs/aws-delivlib/compare/v3.5.15...v3.5.16) (2019-04-06)



<a name="3.5.15"></a>
## [3.5.15](https://github.com/awslabs/aws-delivlib/compare/v3.5.14...v3.5.15) (2019-04-05)



<a name="3.5.14"></a>
## [3.5.14](https://github.com/awslabs/aws-delivlib/compare/v3.5.13...v3.5.14) (2019-04-04)



<a name="3.5.13"></a>
## [3.5.13](https://github.com/awslabs/aws-delivlib/compare/v3.5.12...v3.5.13) (2019-04-03)



<a name="3.5.12"></a>
## [3.5.12](https://github.com/awslabs/aws-delivlib/compare/v3.5.11...v3.5.12) (2019-04-02)



<a name="3.5.11"></a>
## [3.5.11](https://github.com/awslabs/aws-delivlib/compare/v3.5.10...v3.5.11) (2019-04-01)



<a name="3.5.10"></a>
## [3.5.10](https://github.com/awslabs/aws-delivlib/compare/v3.5.9...v3.5.10) (2019-03-31)



<a name="3.5.9"></a>
## [3.5.9](https://github.com/awslabs/aws-delivlib/compare/v3.5.8...v3.5.9) (2019-03-30)



<a name="3.5.8"></a>
## [3.5.8](https://github.com/awslabs/aws-delivlib/compare/v3.5.7...v3.5.8) (2019-03-29)



<a name="3.5.7"></a>
## [3.5.7](https://github.com/awslabs/aws-delivlib/compare/v3.5.6...v3.5.7) (2019-03-28)



<a name="3.5.6"></a>
## [3.5.6](https://github.com/awslabs/aws-delivlib/compare/v3.5.5...v3.5.6) (2019-03-27)



<a name="3.5.5"></a>
## [3.5.5](https://github.com/awslabs/aws-delivlib/compare/v3.5.4...v3.5.5) (2019-03-26)



<a name="3.5.4"></a>
## [3.5.4](https://github.com/awslabs/aws-delivlib/compare/v3.5.3...v3.5.4) (2019-03-25)



<a name="3.5.3"></a>
## [3.5.3](https://github.com/awslabs/aws-delivlib/compare/v3.5.2...v3.5.3) (2019-03-24)



<a name="3.5.2"></a>
## [3.5.2](https://github.com/awslabs/aws-delivlib/compare/v3.5.1...v3.5.2) (2019-03-23)



<a name="3.5.1"></a>
## [3.5.1](https://github.com/awslabs/aws-delivlib/compare/v3.5.0...v3.5.1) (2019-03-22)



<a name="3.5.0"></a>
# [3.5.0](https://github.com/awslabs/aws-delivlib/compare/v3.4.9...v3.5.0) (2019-03-21)


### Features

* PyPI publisher ([#84](https://github.com/awslabs/aws-delivlib/issues/84)) ([9ccce36](https://github.com/awslabs/aws-delivlib/commit/9ccce36))



<a name="3.4.9"></a>
## [3.4.9](https://github.com/awslabs/aws-delivlib/compare/v3.4.8...v3.4.9) (2019-03-20)



<a name="3.4.8"></a>
## [3.4.8](https://github.com/awslabs/aws-delivlib/compare/v3.4.7...v3.4.8) (2019-03-19)



<a name="3.4.7"></a>
## [3.4.7](https://github.com/awslabs/aws-delivlib/compare/v3.4.6...v3.4.7) (2019-03-18)



<a name="3.4.6"></a>
## [3.4.6](https://github.com/awslabs/aws-delivlib/compare/v3.4.5...v3.4.6) (2019-03-17)



<a name="3.4.5"></a>
## [3.4.5](https://github.com/awslabs/aws-delivlib/compare/v3.4.4...v3.4.5) (2019-03-16)



<a name="3.4.4"></a>
## [3.4.4](https://github.com/awslabs/aws-delivlib/compare/v3.4.3...v3.4.4) (2019-03-15)



<a name="3.4.3"></a>
## [3.4.3](https://github.com/awslabs/aws-delivlib/compare/v3.4.2...v3.4.3) (2019-03-14)



<a name="3.4.2"></a>
## [3.4.2](https://github.com/awslabs/aws-delivlib/compare/v3.4.1...v3.4.2) (2019-03-13)



<a name="3.4.1"></a>
## [3.4.1](https://github.com/awslabs/aws-delivlib/compare/v3.4.0...v3.4.1) (2019-03-12)



<a name="3.4.0"></a>
# [3.4.0](https://github.com/awslabs/aws-delivlib/compare/v3.2.13...v3.4.0) (2019-03-11)


### Features

* **s3:** make S3 publisher idempotent ([#81](https://github.com/awslabs/aws-delivlib/issues/81)) ([d8bc2d8](https://github.com/awslabs/aws-delivlib/commit/d8bc2d8))



<a name="3.3.0"></a>
# [3.3.0](https://github.com/awslabs/aws-delivlib/compare/v3.2.13...v3.3.0) (2019-03-11)


### Features

* **s3:** make S3 publisher idempotent ([#81](https://github.com/awslabs/aws-delivlib/issues/81)) ([d8bc2d8](https://github.com/awslabs/aws-delivlib/commit/d8bc2d8))



<a name="3.2.13"></a>
## [3.2.13](https://github.com/awslabs/aws-delivlib/compare/v3.2.12...v3.2.13) (2019-03-10)



<a name="3.2.12"></a>
## [3.2.12](https://github.com/awslabs/aws-delivlib/compare/v3.2.11...v3.2.12) (2019-03-09)



<a name="3.2.11"></a>
## [3.2.11](https://github.com/awslabs/aws-delivlib/compare/v3.2.10...v3.2.11) (2019-03-08)



<a name="3.2.10"></a>
## [3.2.10](https://github.com/awslabs/aws-delivlib/compare/v3.2.9...v3.2.10) (2019-03-07)



<a name="3.2.9"></a>
## [3.2.9](https://github.com/awslabs/aws-delivlib/compare/v3.2.8...v3.2.9) (2019-03-06)



<a name="3.2.8"></a>
## [3.2.8](https://github.com/awslabs/aws-delivlib/compare/v3.2.7...v3.2.8) (2019-03-05)



<a name="3.2.7"></a>
## [3.2.7](https://github.com/awslabs/aws-delivlib/compare/v3.2.6...v3.2.7) (2019-03-04)



<a name="3.2.6"></a>
## [3.2.6](https://github.com/awslabs/aws-delivlib/compare/v3.2.5...v3.2.6) (2019-03-03)



<a name="3.2.5"></a>
## [3.2.5](https://github.com/awslabs/aws-delivlib/compare/v3.2.4...v3.2.5) (2019-03-02)



<a name="3.2.4"></a>
## [3.2.4](https://github.com/awslabs/aws-delivlib/compare/v3.2.3...v3.2.4) (2019-03-01)



<a name="3.2.3"></a>
## [3.2.3](https://github.com/awslabs/aws-delivlib/compare/v3.2.2...v3.2.3) (2019-02-28)



<a name="3.2.2"></a>
## [3.2.2](https://github.com/awslabs/aws-delivlib/compare/v3.2.1...v3.2.2) (2019-02-27)



<a name="3.2.1"></a>
## [3.2.1](https://github.com/awslabs/aws-delivlib/compare/v3.2.0...v3.2.1) (2019-02-26)



<a name="3.2.0"></a>
# [3.2.0](https://github.com/awslabs/aws-delivlib/compare/v3.0.0...v3.2.0) (2019-02-25)


### Features

* **superchain:** add MSBuild to Superchain image ([#76](https://github.com/awslabs/aws-delivlib/issues/76)) ([b2f1dfa](https://github.com/awslabs/aws-delivlib/commit/b2f1dfa))
* automatic bumps ([#12](https://github.com/awslabs/aws-delivlib/issues/12)) ([39ea8a0](https://github.com/awslabs/aws-delivlib/commit/39ea8a0)), closes [awslabs/cdk-ops#103](https://github.com/awslabs/cdk-ops/issues/103)
* make it possible to add arbitrary processing steps ([#77](https://github.com/awslabs/aws-delivlib/issues/77)) ([f2ceb8a](https://github.com/awslabs/aws-delivlib/commit/f2ceb8a))



<a name="3.1.0"></a>
# [3.1.0](https://github.com/awslabs/aws-delivlib/compare/v3.0.0...v3.1.0) (2019-02-25)


### Features

* make it possible to add arbitrary processing steps ([#77](https://github.com/awslabs/aws-delivlib/issues/77)) ([f2ceb8a](https://github.com/awslabs/aws-delivlib/commit/f2ceb8a))
* **superchain:** add MSBuild to Superchain image ([#76](https://github.com/awslabs/aws-delivlib/issues/76)) ([b2f1dfa](https://github.com/awslabs/aws-delivlib/commit/b2f1dfa))



<a name="3.0.0"></a>
## [3.0.0](https://github.com/awslabs/aws-delivlib/compare/v2.0.1...v3.0.0) (2019-02-20)


### Bug Fixes

* Correctly set environment before using gpg ([#69](https://github.com/awslabs/aws-delivlib/issues/69)) ([19aeed5](https://github.com/awslabs/aws-delivlib/commit/19aeed5))
* Don't attempt deleting OpenPGP keys' secrets ([#70](https://github.com/awslabs/aws-delivlib/issues/70)) ([de02f7c](https://github.com/awslabs/aws-delivlib/commit/de02f7c))
* Upgrade npm if 'npm ci' is unsupported ([#72](https://github.com/awslabs/aws-delivlib/issues/72)) ([e8a19ca](https://github.com/awslabs/aws-delivlib/commit/e8a19ca))


### Features

* Rename PGPSecret to OpenPGPKeyPair ([#67](https://github.com/awslabs/aws-delivlib/issues/67)) ([c540def](https://github.com/awslabs/aws-delivlib/commit/c540def))
* Support Change Control Policies ([#71](https://github.com/awslabs/aws-delivlib/issues/71)) ([82acca9](https://github.com/awslabs/aws-delivlib/commit/82acca9)), closes [awslabs/cdk-ops#231](https://github.com/awslabs/cdk-ops/issues/231)


### BREAKING CHANGES

* The `PGPSecret` class was renamed to `OpenPGPKeyPair`.



<a name="2.0.1"></a>
## [2.0.1](https://github.com/awslabs/aws-delivlib/compare/v2.0.0...v2.0.1) (2019-02-11)

### Bug Fixes

* Add missing permission to PGPSecret CustomResource

<a name="2.0.0"></a>
## [2.0.0](https://github.com/awslabs/aws-delivlib/compare/v1.0.0...v2.0.0) (2019-02-11)


### Features

* Create OpenPGP Public Key parameter using SSM resource ([#63](https://github.com/awslabs/aws-delivlib/issues/63)) ([a3510f1](https://github.com/awslabs/aws-delivlib/commit/a3510f1))
* Move permission grant function to PGPSecret ([#62](https://github.com/awslabs/aws-delivlib/issues/62)) ([7c6809a](https://github.com/awslabs/aws-delivlib/commit/7c6809a))

### BREAKING CHANGES

* `ICredentialPair` now conveys `ssm.IStringParameter` and `secretsManager.ISecret` instead of the ARNs and related attributes of those.


<a name="1.0.0"></a>
## [1.0.0](https://github.com/awslabs/aws-delivlib/compare/v0.4.0...v1.0.0) (2019-01-29)


### Bug Fixes

* Correctly model accepted/required attributes ([#35](https://github.com/awslabs/aws-delivlib/issues/35)) ([52bdccb](https://github.com/awslabs/aws-delivlib/commit/52bdccb))
* pgp-secret did not store passphrase in secrets manager ([#45](https://github.com/awslabs/aws-delivlib/issues/45)) ([d8f9dbc](https://github.com/awslabs/aws-delivlib/commit/d8f9dbc))
* Stop surfacing and using secret VersionIds ([#33](https://github.com/awslabs/aws-delivlib/issues/33)) ([afbd204](https://github.com/awslabs/aws-delivlib/commit/afbd204))


### Code Refactoring

* improvements to shellable, testable and canary ([#46](https://github.com/awslabs/aws-delivlib/issues/46)) ([2446bd1](https://github.com/awslabs/aws-delivlib/commit/2446bd1))


### Features

* wrap the superchain image in a Superchain construct. ([#38](https://github.com/awslabs/aws-delivlib/issues/38)) ([5713727](https://github.com/awslabs/aws-delivlib/commit/5713727))
* **shallable:** assume-role ([#47](https://github.com/awslabs/aws-delivlib/issues/47)) ([1b9ef5d](https://github.com/awslabs/aws-delivlib/commit/1b9ef5d))


### BREAKING CHANGES

* `Testable` has been removed, `environmentVariables`
has been renamed to `env` and changed schema; `pipeline.env` renamed to `environment`.



<a name="0.5.0"></a>
## [0.5.0](https://github.com/awslabs/aws-delivlib/compare/v0.4.0...v0.5.0) (2019-01-15)


### Bug Fixes

* Correctly model accepted/required attributes ([#35](https://github.com/awslabs/aws-delivlib/issues/35)) ([52bdccb](https://github.com/awslabs/aws-delivlib/commit/52bdccb))
* Stop surfacing and using secret VersionIds ([#33](https://github.com/awslabs/aws-delivlib/issues/33)) ([afbd204](https://github.com/awslabs/aws-delivlib/commit/afbd204))


### Features

* wrap the superchain image in a Superchain construct. ([#38](https://github.com/awslabs/aws-delivlib/issues/38)) ([5713727](https://github.com/awslabs/aws-delivlib/commit/5713727))



<a name="0.4.0"></a>
## [0.4.0](https://github.com/awslabs/aws-delivlib/compare/v0.3.2...v0.4.0) (2019-01-07)

### Features

* Allow update of PGPSecret and PrivateKey ([#20](https://github.com/awslabs/aws-delivlib/issues/20)) ([bfc6225](https://github.com/awslabs/aws-delivlib/commit/bfc6225))

### BREAKING CHANGES

* This changes the API of the PGPSecret and CodeSigningCertificate constructs to offer a consistent API for accessing the name
and ARNs of the secret and parameters associated with the secrets, through the `ICredentialPair` interface.


<a name="0.3.2"></a>
## [0.3.2](https://github.com/awslabs/aws-delivlib/compare/v0.3.1...v0.3.2) (2018-12-20)


### Bug Fixes

* upgrade changelog parser ([#28](https://github.com/awslabs/aws-delivlib/issues/28)) ([813e837](https://github.com/awslabs/aws-delivlib/commit/813e837))


<a name="0.3.1"></a>
## [0.3.1](https://github.com/awslabs/aws-delivlib/compare/v0.3.0...v0.3.1) (2018-12-19)

### Bug Fixes

* do not assume executable permissions on publishing scripts ([#25](https://github.com/awslabs/aws-delivlib/issues/25)) ([6832ebe](https://github.com/awslabs/aws-delivlib/commit/6832ebe))

### Features

* **pgp-secret:** Surface parameterName attribute ([#17](https://github.com/awslabs/aws-delivlib/issues/17)) ([972a1c9](https://github.com/awslabs/aws-delivlib/commit/972a1c9))

<a name="0.3.0"></a>
## 0.3.0 (2018-12-18)


### Bug Fixes

* Correctly import requests ([#15](https://github.com/awslabs/aws-delivlib/issues/15)) ([637290e](https://github.com/awslabs/aws-delivlib/commit/637290e))
* Custom resource behavior ([40885c0](https://github.com/awslabs/aws-delivlib/commit/40885c0))
* Logger reference in CSC custom resources ([#14](https://github.com/awslabs/aws-delivlib/issues/14)) ([4c0bca6](https://github.com/awslabs/aws-delivlib/commit/4c0bca6))


### Features

* **gh-pages-publisher:** force-push without history ([#7](https://github.com/awslabs/aws-delivlib/issues/7)) ([e062ab7](https://github.com/awslabs/aws-delivlib/commit/e062ab7))
* **github-releases:** if changelog doesn't exist, don't include release notes ([#8](https://github.com/awslabs/aws-delivlib/issues/8)) ([ab0d58c](https://github.com/awslabs/aws-delivlib/commit/ab0d58c))
* **pipeline:** concurrency limit ([#9](https://github.com/awslabs/aws-delivlib/issues/9)) ([268a128](https://github.com/awslabs/aws-delivlib/commit/268a128))
* **pipeline:** send email notifications on any action failure ([#10](https://github.com/awslabs/aws-delivlib/issues/10)) ([dab2348](https://github.com/awslabs/aws-delivlib/commit/dab2348))
* expose failure alarm to allow developers to configure hooks ([#18](https://github.com/awslabs/aws-delivlib/issues/18)) ([2ed0f16](https://github.com/awslabs/aws-delivlib/commit/2ed0f16))
* NuGet assemblies code signing ([#2](https://github.com/awslabs/aws-delivlib/issues/2)) ([e715c65](https://github.com/awslabs/aws-delivlib/commit/e715c65))



# Change log

## [0.2.1](https://github.com/awslabs/aws-cdk/compare/v0.2.0...v0.2.1) (2018-12-17)

### Fixes

* **code-signing-certificate**: fix behavior of custom resources ([#15](https://github.com/awslabs/aws-delivlib/pull/15) and [40885c0](https://github.com/awslabs/aws-delivlib/commit/40885c01b0a75fd9a41e64264fce7afcc1337194))

## [0.2.0](https://github.com/awslabs/aws-cdk/compare/v0.1.2...v0.2.0) (2018-12-13)

### Features

* **pipeline**: concurrency limit ([#9](https://github.com/awslabs/aws-delivlib/pull/9))
* **gh-pages-publisher**: force-push without history ([#7](https://github.com/awslabs/aws-delivlib/pull/7))
* **pipeline**: send email notifications on any action failure ([#10](https://github.com/awslabs/aws-delivlib/pull/10))
* **github-releases**: if changelog doesn't exist, don't include release notes ([#8](https://github.com/awslabs/aws-delivlib/pull/8))
* **pipeline**: raise an alarm when any stages are in a Failed state ([#6](https://github.com/awslabs/aws-delivlib/pull/6))

## [0.1.2](https://github.com/awslabs/aws-cdk/compare/v0.1.1...v0.1.2) (2018-12-12)

### Features

* NuGet publisher now supports X509 code signing ([#2](https://github.com/awslabs/aws-delivlib/pull/2)) ([e715c65](https://github.com/awslabs/aws-delivlib/commit/e715c65))
* The CodePipeline can be phyiscal-named ([#3](https://github.com/awslabs/aws-delivlib/pull/3)) ([f38a8a3](https://github.com/awslabs/aws-delivlib/commit/f38a8a3))
