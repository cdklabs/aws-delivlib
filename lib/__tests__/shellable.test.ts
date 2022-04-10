import * as path from 'path';
import { expect as assert, haveResource, ResourcePart, SynthUtils } from '@monocdk-experiment/assert';
import * as cdk from 'monocdk';
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

  const template = assert(stack).value;

  expect(JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec).phases.pre_build.commands).toEqual([
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
  ]);
});

test('minimal configuration', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project'));
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

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
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

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\" --external-id \"my-externa-id\" > $creds');
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

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=regional aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
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

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
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

  assert(stack).to(haveResource('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 1,
    Threshold: 1,
    Period: 300,
  }));
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

  assert(stack).to(haveResource('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 2,
    Threshold: 5,
    Period: 3600,
  }));
});

test('privileged mode', () => {
  const stack = new cdk.Stack(new cdk.App(), 'TestStack');

  new Shellable(stack, 'AllowDocker', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    privileged: true,
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project', {
    Environment: {
      PrivilegedMode: true,
    },
  }, ResourcePart.Properties, true));
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

  assert(stack).to(haveResource('AWS::CodeBuild::Project', {
    Environment: {
      EnvironmentVariables: [
        {
          Name: 'SCRIPT_S3_BUCKET',
          Type: 'PLAINTEXT',
          Value: {
            Ref: 'AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC',
          },
        },
        {
          Name: 'SCRIPT_S3_KEY',
          Type: 'PLAINTEXT',
          Value: {
            'Fn::Join': ['', [{
              'Fn::Select': [0, {
                'Fn::Split': ['||', {
                  Ref: 'AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3VersionKeyF3F83F76',
                }],
              }],
            }, {
              'Fn::Select': [1, {
                'Fn::Split': ['||', {
                  Ref: 'AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3VersionKeyF3F83F76',
                }],
              }],
            }]],
          },
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
          Value: 'arn:test:secretsmanager:region:000000000000:secret:env-var-secret-name-abc123',
        },
        {
          Name: 'ENV_VAR_PARAMETER',
          Type: 'PARAMETER_STORE',
          Value: 'env-var-parameter-name',
        },
      ],
    },
  }, ResourcePart.Properties, true));

  assert(stack).to(haveResource('AWS::IAM::Policy', {
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
          Resource: 'arn:test:secretsmanager:region:000000000000:secret:env-var-secret-name-abc123*',
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
                    Ref: 'AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC',
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
                    Ref: 'AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC',
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
  }));
});
