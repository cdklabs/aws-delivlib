import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Shellable, ShellPlatform } from '../../lib';


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

test('assume role not supported on windows', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  expect(() => new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    platform: ShellPlatform.Windows,
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
    },
  })).toThrow('assumeRole is not supported on Windows');
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
