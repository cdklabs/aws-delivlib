import * as path from 'path';
import {
  App, Stack, StackProps,
  aws_events as events,
  aws_iam as iam,
  aws_kms as kms,
} from 'aws-cdk-lib';
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import * as delivlib from '../../lib';


const testDir = path.join(__dirname, 'delivlib-tests');

export class TestStack extends Stack {
  constructor(parent: App, id: string, props: StackProps = { }) {
    super(parent, id, props);

    //
    // SOURCE
    //

    const githubRepo = new delivlib.WritableGitHubRepo({
      repository: 'awslabs/aws-delivlib-sample',
      tokenSecretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:github-token-QDP6QX',
      sshKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/github-ssh-okGazo' },
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
      environment: {
        DELIVLIB_ENV_TEST: 'MAGIC_1924',
      },
      dryRun: true,
      buildImage: LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-bullseye-slim-node18'),
    });

    //
    // TEST
    //

    // add a test that runs on an ubuntu linux
    pipeline.addTest('HelloLinux', {
      platform: delivlib.ShellPlatform.LinuxUbuntu,
      entrypoint: 'test.sh',
      scriptDirectory: path.join(testDir, 'linux'),
    });

    // add a test that runs on Windows
    pipeline.addTest('HelloWindows', {
      platform: delivlib.ShellPlatform.Windows,
      entrypoint: 'test.ps1',
      scriptDirectory: path.join(testDir, 'windows'),
    });

    const externalId = 'require-me-please';

    const role = new iam.Role(this, 'AssumeMe', {
      assumedBy: new iam.AccountPrincipal(Stack.of(this).account),
      externalIds: [externalId],
    });

    pipeline.addTest('AssumeRole', {
      entrypoint: 'test.sh',
      scriptDirectory: path.join(testDir, 'assume-role'),
      assumeRole: {
        roleArn: role.roleArn,
        sessionName: 'assume-role-test',
        externalId,
      },
      environment: {
        EXPECTED_ROLE_NAME: role.roleName,
      },
    });

    const action = pipeline.addShellable('Test', 'GenerateTwoArtifacts', {
      entrypoint: 'void.sh',
      scriptDirectory: path.join(testDir, 'linux'),
      buildSpec: delivlib.BuildSpec.simple({
        build: [
          'mkdir -p output1 output2',
          'echo \'{"name": "output1", "version": "1.2.3", "commit": "abcdef"}\' > output1/build.json',
          'echo \'{"name": "output2", "version": "1.2.3", "commit": "abcdef"}\' > output2/build.json',
        ],
        artifactDirectory: 'output1',
        additionalArtifactDirectories: {
          artifact2: 'output2',
        },
      }),
    }).action;
    const shellableArtifacts = action.actionProperties.outputs;

    //
    // CANARY
    //

    pipeline.addCanary('HelloCanary', {
      schedule: events.Schedule.expression('rate(1 minute)'),
      scriptDirectory: path.join(testDir, 'linux'),
      entrypoint: 'test.sh',
    });

    //
    // PUBLISH
    //

    pipeline.publishToNpm({
      npmTokenSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/npm-MhaWgx' },
      access: delivlib.NpmAccess.RESTRICTED,
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
        stateOrProvince: 'Ztate',
      },
      retainPrivateKey: false,
    });

    pipeline.publishToNuGet({
      nugetApiKeySecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/nuget-jDbgrN' },
      codeSign,
    });

    const signingKey = new delivlib.OpenPGPKeyPair(this, 'CodeSign', {
      email: 'aws-cdk-dev+delivlib@amazon.com',
      encryptionKey: new kms.Key(this, 'CodeSign-CMK'),
      expiry: '4y',
      identity: 'aws-cdk-dev',
      keySizeBits: 4_096,
      pubKeyParameterName: `/${this.node.path}/CodeSign.pub`,
      // I am not able to immediately delete the existing secret, it needs to wait at least 7 days.
      secretName: this.node.path + '/CodeSignV2',
      version: 0,
      removalPolicy: delivlib.OpenPGPKeyPairRemovalPolicy.DESTROY_IMMEDIATELY,
    });

    pipeline.publishToMaven({
      mavenLoginSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/maven-S4Q2y3' },
      mavenEndpoint: 'https://aws.oss.sonatype.org:443/',
      signingKey,
      stagingProfileId: '68a05363083174',
    });

    pipeline.publishToGitHub({
      githubRepo,
      signingKey,
      additionalInputArtifacts: shellableArtifacts,
    });

    pipeline.publishToGitHubPages({
      githubRepo,
    });

    pipeline.publishToPyPI({
      loginSecret: { secretArn: 'arn:aws:secretsmanager:us-east-1:712950704752:secret:delivlib/pypi-tp8M57' },
    });

    // publish go bindings to awslabs/aws-delivlib-sample under the "golang"
    // branch (repository is derived from "go.moduleName" in package.json)
    pipeline.publishToGolang({
      githubTokenSecret: { secretArn: githubRepo.tokenSecretArn },
      gitBranch: 'golang',
      gitUserEmail: 'aws-cdk-dev+delivlib@amazon.com',
      gitUserName: 'Delivlib Tests',
    });

    //
    // BUMP

    pipeline.autoBump({
      bumpCommand: 'npm i && npm run bump',
    });

    //
    // AUTO-BUILD

    pipeline.autoBuild({
      publicLogs: true,
    });

    //
    // CHANGE CONTROL
    //

    pipeline.addChangeControl();
  }
}
