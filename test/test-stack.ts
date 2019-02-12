import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
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

    const repo = new delivlib.GitHubRepo({
      repository: 'awslabs/aws-delivlib-sample',
      tokenParameterName: 'github-token'
    });

    //
    // BUILD
    //

    const pipeline = new delivlib.Pipeline(this, 'CodeCommitPipeline', {
      title: 'aws-delivlib test pipeline',
      repo,
      notificationEmail: 'aws-cdk-dev+delivlib-test@amazon.com',
      environment: {
        DELIVLIB_ENV_TEST: 'MAGIC_1924'
      }
    });

    //
    // TEST
    //

    // add a test that runs on an ubuntu linux
    pipeline.addTest('HelloLinux', {
      platform: delivlib.ShellPlatform.LinuxUbuntu,
      entrypoint: 'test.sh',
      scriptDirectory: path.join(testDir, 'linux')
    });

    // add a test that runs on Windows
    pipeline.addTest('HelloWindows', {
      platform: delivlib.ShellPlatform.Windows,
      entrypoint: 'test.ps1',
      scriptDirectory: path.join(testDir, 'windows')
    });

    const externalId = 'require-me-please';

    const role = new iam.Role(this, 'AssumeMe', {
      assumedBy: new iam.AccountPrincipal(this.accountId),
      externalId
    });

    pipeline.addTest('AssumeRole', {
      entrypoint: 'test.sh',
      scriptDirectory: path.join(testDir, 'assume-role'),
      assumeRole: {
        roleArn: role.roleArn,
        sessionName: 'assume-role-test',
        externalId
      },
      environment: {
        EXPECTED_ROLE_NAME: role.roleName
      }
    });

    //
    // CANARY
    //

    pipeline.addCanary('HelloCanary', {
      scheduleExpression: 'rate(1 minute)',
      scriptDirectory: path.join(testDir, 'linux'),
      entrypoint: 'test.sh'
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

    const signingKey = new delivlib.OpenPGPKeyPair(this, 'CodeSign', {
      email: 'aws-cdk-dev+delivlib@amazon.com',
      encryptionKey: new kms.EncryptionKey(this, 'CodeSign-CMK'),
      expiry: '4y',
      identity: 'aws-cdk-dev',
      keySizeBits: 4_096,
      pubKeyParameterName: `/${this.node.path}/CodeSign.pub`,
      secretName: this.node.path + '/CodeSign',
      version: 0,
    });

    pipeline.publishToMaven({
      mavenLoginSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/maven-7ROCWi' },
      signingKey,
      stagingProfileId: '68a05363083174'
    });

    pipeline.publishToGitHub({
      githubRepo: repo,
      signingKey
    });

    pipeline.publishToGitHubPages({
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/github-ssh-lwzfjW' },
      githubRepo: repo,
      commitEmail: 'foo@bar.com',
      commitUsername: 'foobar',
    });
  }
}
