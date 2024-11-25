# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check [existing open](https://github.com/awslabs/aws-delivlib/issues), or [recently closed](https://github.com/awslabs/aws-delivlib/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aclosed%20), issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of our code being used
* Any modifications you've made relevant to the bug
* Anything unusual about your environment or deployment

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *main* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Commit to your fork using clear commit messages.
5. Send us a pull request, answering any default questions in the pull request interface.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any ['help wanted'](https://github.com/awslabs/aws-delivlib/labels/help%20wanted) issues is a great place to start.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Development Environment

To setup a development environment:

1. Clone the repo
2. Run `yarn install`
3. Run `yarn build` (or `yarn watch`) to compile typescript
4. Run `yarn test`

## Testing

We have good coverage of unit tests that should be testing the bulk of the logic in delivlib. For every contribution and change,
we expect them to be covered by unit tests, where appropriate.

You can run the tests by executing:

```console
yarn compile
yarn test
```

Besides this, there is a delivlib instance deployed to an AWS account (712950704752) that configures a delivlib pipeline for
the package [aws-delivlib-sample](https://github.com/awslabs/aws-delivlib-sample).

You should use this code to validate more elaborate changes to the Delivlib code base. To do this,

1. Setup credentials to our AWS account: 712950704752
2. Execute `yarn integ:update`. This will update the delivlib instance.

At this point, you will find the resources created by delivlib in the stack whose ARN is printed to the console. Wait for the
deployment to complete, and are then free to test and verify that your changes had the intended effect.

> NOTE: you might need to manually replicate the CDKlabs credentials to the publishing account. We don't do
> this often enough to make it worthwhile investing into automation for it.

## Releasing a New Version

Every commit pushed to main will be picked up by the build & release pipeline automatically,
so there's nothing manual you need to do to release a new version.

## Licensing

See the [LICENSE](https://github.com/awslabs/aws-delivlib/blob/main/LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
