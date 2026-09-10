import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Shellable, ShellPlatform, WindowsPlatform } from '../../lib';


// tslint:disable:max-line-length

test('can assume a refreshable role', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      profileName: 'profile',
      roleArn: 'arn',
      sessionName: 'session',
      refresh: true,
    },
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'echo "Downloading scripts from s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY}"',
              'aws s3 cp s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY} /tmp',
              'mkdir -p /tmp/scriptdir',
              'unzip /tmp/$(basename $SCRIPT_S3_KEY) -d /tmp/scriptdir',
              'mkdir -p ~/.aws',
              'touch ~/.aws/credentials',
              'config=~/.aws/config',
              'echo [profile profile]>> ${config}',
              'echo credential_source = EcsContainer >> ${config}',
              'echo role_session_name = session >> ${config}',
              'echo role_arn = arn >> $config',
              'export AWS_PROFILE=profile',
              'export AWS_SDK_LOAD_CONFIG=1',
            ]),
          },
        }),
      }),
    },
  });
});

test('minimal configuration', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::CodeBuild::Project', 1);
});

test('assume role', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
    },
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds',
            ]),
          },
        }),
      }),
    },
  });
});

test('assume role with external-id', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
      externalId: 'my-externa-id',
    },
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\" --external-id \"my-externa-id\" > $creds',
            ]),
          },
        }),
      }),
    },
  });
});

test('assume role with regional endpoints', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
    },
    useRegionalStsEndpoints: true,
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'AWS_STS_REGIONAL_ENDPOINTS=regional aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds',
            ]),
          },
        }),
      }),
    },
  });

});

test('assume role with global endpoints', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
    },
    useRegionalStsEndpoints: false,
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds',
            ]),
          },
        }),
      }),
    },
  });

});

test('assume role on windows uses powershell to export credentials', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/windows'),
    platform: ShellPlatform.Windows,
    entrypoint: 'test.ps1',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
    },
    useRegionalStsEndpoints: false,
  });

  const template = Template.fromStack(stack);
  // Assert the FULL ordered pre_build sequence: the script bundle must be downloaded
  // (as the CodeBuild role) BEFORE the assume-role credential switch. Otherwise the
  // download would run as the assumed (cross-account) role, which lacks bucket access.
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: [
              'echo "Downloading scripts from s3://$env:SCRIPT_S3_BUCKET/$env:SCRIPT_S3_KEY"',
              'New-Item -ItemType Directory -Force -Path C:\\delivlib\\scriptdir | Out-Null',
              'aws s3 cp s3://$env:SCRIPT_S3_BUCKET/$env:SCRIPT_S3_KEY C:\\delivlib\\scriptdir\\scripts.zip',
              'Expand-Archive -Path C:\\delivlib\\scriptdir\\scripts.zip -DestinationPath C:\\delivlib\\scriptdir -Force',
              '$env:AWS_STS_REGIONAL_ENDPOINTS = "legacy"',
              '$assumedRole = aws sts assume-role --role-arn "arn:aws:role:to:assume" --role-session-name "my-session-name" | ConvertFrom-Json',
              '$env:AWS_ACCESS_KEY_ID = $assumedRole.Credentials.AccessKeyId',
              '$env:AWS_SECRET_ACCESS_KEY = $assumedRole.Credentials.SecretAccessKey',
              '$env:AWS_SESSION_TOKEN = $assumedRole.Credentials.SessionToken',
            ],
          },
        }),
      }),
    },
  });
});

test('assume role on windows with regional endpoints and external id', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/windows'),
    platform: ShellPlatform.Windows,
    entrypoint: 'test.ps1',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
      externalId: 'my-external-id',
    },
    useRegionalStsEndpoints: true,
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              '$env:AWS_STS_REGIONAL_ENDPOINTS = "regional"',
              '$assumedRole = aws sts assume-role --role-arn "arn:aws:role:to:assume" --role-session-name "my-session-name" --external-id "my-external-id" | ConvertFrom-Json',
            ]),
          },
        }),
      }),
    },
  });
});

test('assume role on windows with refresh writes a shared config profile', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/windows'),
    platform: ShellPlatform.Windows,
    entrypoint: 'test.ps1',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
      refresh: true,
    },
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: Match.serializedJson({
        version: '0.2',
        phases: Match.objectLike({
          pre_build: {
            commands: Match.arrayWith([
              'Add-Content -Path $env:USERPROFILE\\.aws\\config -Value "[profile long-running-profile]"',
              'Add-Content -Path $env:USERPROFILE\\.aws\\config -Value "credential_source = EcsContainer"',
              'Add-Content -Path $env:USERPROFILE\\.aws\\config -Value "role_arn = arn:aws:role:to:assume"',
              '$env:AWS_PROFILE = "long-running-profile"',
              '$env:AWS_SDK_LOAD_CONFIG = "1"',
            ]),
          },
        }),
      }),
    },
  });
});

test('alarm options - defaults', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 1,
    Threshold: 1,
    Period: 300,
  });
});

test('alarm options - custom', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    alarmEvaluationPeriods: 2,
    alarmThreshold: 5,
    alarmPeriod: cdk.Duration.minutes(60),
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 2,
    Threshold: 5,
    Period: 3600,
  });
});

test('privileged mode', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'AllowDocker', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    privileged: true,
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Environment: {
      PrivilegedMode: true,
    },
  });
});

test('environment variables', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'EnvironmentVariables', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    environment: {
      ENV_VAR: 'env-var-value',
      UNDEFINED_VAR: undefined,
      EMPTY_STRING: '',
    },
    environmentSecrets: {
      ENV_VAR_SECRET: 'arn:test:secretsmanager:region:000000000000:secret:env-var-secret-name-abc123',
    },
    environmentParameters: {
      ENV_VAR_PARAMETER: 'env-var-parameter-name',
    },
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Environment: {
      EnvironmentVariables: [
        {
          Name: 'SCRIPT_S3_BUCKET',
          Type: 'PLAINTEXT',
          Value: {
            'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
          },
        },
        {
          Name: 'SCRIPT_S3_KEY',
          Type: 'PLAINTEXT',
          Value: '3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4.zip',
        },
        {
          Name: 'ENV_VAR',
          Type: 'PLAINTEXT',
          Value: 'env-var-value',
        },
        {
          Name: 'EMPTY_STRING',
          Type: 'PLAINTEXT',
          Value: '',
        },
        {
          Name: 'ENV_VAR_SECRET',
          Type: 'SECRETS_MANAGER',
          Value: 'env-var-secret-name',
        },
        {
          Name: 'ENV_VAR_PARAMETER',
          Type: 'PARAMETER_STORE',
          Value: 'env-var-parameter-name',
        },
      ],
    },
  });

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'ssm:GetParameters',
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':ssm:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':parameter/env-var-parameter-name',
              ],
            ],
          },
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':secretsmanager:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':secret:env-var-secret-name-??????',
              ],
            ],
          },
        },
        {
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':logs:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':log-group:/aws/codebuild/',
                  {
                    Ref: 'EnvironmentVariablesD266B682',
                  },
                ],
              ],
            },
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':logs:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':log-group:/aws/codebuild/',
                  {
                    Ref: 'EnvironmentVariablesD266B682',
                  },
                  ':*',
                ],
              ],
            },
          ],
        },
        {
          Action: [
            'codebuild:CreateReportGroup',
            'codebuild:CreateReport',
            'codebuild:UpdateReport',
            'codebuild:BatchPutTestCases',
            'codebuild:BatchPutCodeCoverages',
          ],
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':codebuild:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':report-group/',
                {
                  Ref: 'EnvironmentVariablesD266B682',
                },
                '-*',
              ],
            ],
          },
        },
        {
          Action: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'logs:DescribeLogGroups',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            's3:GetEncryptionConfiguration',
            's3:PutObject',
          ],
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: [
            's3:GetObject*',
            's3:GetBucket*',
            's3:List*',
          ],
          Effect: 'Allow',
          Resource: [
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':s3:::',
                  {
                    'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                  },
                ],
              ],
            },
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':s3:::',
                  {
                    'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                  },
                  '/*',
                ],
              ],
            },
          ],
        },
        {
          Action: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          Effect: 'Allow',
          Resource: 'arn:test:secretsmanager:region:000000000000:secret:env-var-secret-name-abc123',
        },
        {
          Action: [
            'ssm:DescribeParameters',
            'ssm:GetParameters',
            'ssm:GetParameter',
            'ssm:GetParameterHistory',
          ],
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                {
                  Ref: 'AWS::Partition',
                },
                ':ssm:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                ':parameter/env-var-parameter-name',
              ],
            ],
          },
        },
      ],
      Version: '2012-10-17',
    },
    PolicyName: 'EnvironmentVariablesRoleDefaultPolicy1BCDD5D0',
    Roles: [
      {
        Ref: 'EnvironmentVariablesRole93B5CD9F',
      },
    ],
  });
});

test('can exclude files from scriptDirectory', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');

  new Shellable(stack, 'EnvironmentVariables', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    // This should result in only `test.sh` being included
    excludeFilePatterns: ['*.sh', '**/README', '!test.sh'],
    entrypoint: 'test.sh',
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Environment: {
      EnvironmentVariables: [
        {
          Name: 'SCRIPT_S3_BUCKET',
          Type: 'PLAINTEXT',
          Value: {
            'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
          },
        },
        {
          Name: 'SCRIPT_S3_KEY',
          Type: 'PLAINTEXT',
          // This is the hash of a directory with only `test.sh` included
          Value: 'f2ad7bd80137ae8bf3e86164ae8943f7ffbe8b99470f91eb3f24c3b83873a089.zip',
        },
      ],
    },
  });
});


test('WindowsPlatform installs node via chocolatey by default', () => {
  const platform = new WindowsPlatform(codebuild.WindowsBuildImage.WIN_SERVER_CORE_2019_BASE);

  expect(platform.installCommands()).toEqual([
    'Import-Module "C:\\ProgramData\\chocolatey\\helpers\\chocolateyProfile.psm1"',
    'C:\\ProgramData\\chocolatey\\bin\\choco.exe upgrade nodejs-lts -y',
  ]);
});

test('WindowsPlatform can disable chocolatey node upgrade', () => {
  const platform = new WindowsPlatform(codebuild.WindowsBuildImage.WIN_SERVER_CORE_2019_BASE, {
    upgradeNodeWithChocolatey: false,
  });

  expect(platform.installCommands()).toBeUndefined();
});
