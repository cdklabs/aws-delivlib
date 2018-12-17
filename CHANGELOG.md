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
