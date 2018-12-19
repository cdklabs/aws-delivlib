import cdk = require('@aws-cdk/cdk');
import path = require('path');
import delivlib = require('../lib');

const testDir = path.join(__dirname, 'delivlib-tests');

export class TestStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props: cdk.StackProps = { }) {
    super(parent, id, props);

    //
    // SOURCE
    //

    const githubRepo = new delivlib.WritableGitHubRepo({
      repository: 'awslabs/aws-delivlib-sample',
      tokenParameterName: 'github-token',
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/github-ssh-lwzfjW' },
      commitEmail: 'foo@bar.com',
      commitUsername: 'foobar',
    });

    //
    // BUILD
    //

    const pipeline = new delivlib.Pipeline(this, 'CodeCommitPipeline', {
      title: 'aws-delivlib test pipeline',
      repo: githubRepo,
      notificationEmail: 'aws-cdk-dev+delivlib-test@amazon.com',
      env: {
        DELIVLIB_ENV_TEST: 'MAGIC_1924'
      }
    });

    //
    // TEST
    //

    // add a test that runs on an ubuntu linux
    pipeline.addTest('HelloLinux', {
      platform: delivlib.ShellPlatform.LinuxUbuntu,
      testDirectory: path.join(testDir, 'linux')
    });

    // add a test that runs on Windows
    pipeline.addTest('HelloWindows', {
      platform: delivlib.ShellPlatform.Windows,
      testDirectory: path.join(testDir, 'windows')
    });

    //
    // PUBLISH
    //

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-OynG62' }
    });

    // this creates a self-signed certificate
    const codeSign = new delivlib.CodeSigningCertificate(this, 'X509CodeSigningKey', {
      distinguishedName: {
        commonName: 'delivlib-test',
        country: 'IL',
        emailAddress: 'aws-cdk-dev+delivlib-test@amazon.com',
        locality: 'Zity',
        organizationName: 'Amazon Test',
        organizationalUnitName: 'AWS',
        stateOrProvince: 'Ztate'
      }
    });

    pipeline.publishToNuGet({
      nugetApiKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/nuget-fHzSUD' },
      codeSign,
    });

    const signingKey = new delivlib.OpenPgpKey(this, 'CodeSign', {
      email: 'aws-cdk-dev+delivlib@amazon.com',
      identity: 'aws-cdk-dev',
    });

    pipeline.publishToMaven({
      mavenLoginSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/maven-7ROCWi' },
      signingKey,
      stagingProfileId: '68a05363083174'
    });

    pipeline.publishToGitHub({
      githubRepo,
      signingKey
    });

    pipeline.publishToGitHubPages({
      githubRepo,
    });

    //
    // BUMP

    new delivlib.AutoBump(this, 'AutoBump', {
      repo: githubRepo,
      bumpCommand: 'npm i && npm run bump'
    });
  }
}
