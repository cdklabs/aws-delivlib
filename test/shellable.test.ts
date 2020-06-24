import * as cdk from "monocdk-experiment";
import { expect as assert, haveResource, ResourcePart, SynthUtils } from "@monocdk-experiment/assert";
import path = require("path");
import { Shellable, ShellPlatform } from "../lib";
const { Stack } = cdk;


// tslint:disable:max-line-length

test('minimal configuration', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh'
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project'));
});

test('assume role', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name'
    }
  });

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
});

test('assume role with external-id', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name',
      externalId: 'my-externa-id',
    }
  });

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\" --external-id \"my-externa-id\" > $creds');
});

test('assume role with regional endpoints', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name'
    },
    useRegionalStsEndpoints: true
  });

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=regional aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
});

test('assume role with global endpoints', () => {
  const stack = new cdk.Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name'
    },
    useRegionalStsEndpoints: false
  });

  const template = SynthUtils.synthesize(stack).template;
  const buildSpec = JSON.parse(template.Resources.MyShellableB2FFD397.Properties.Source.BuildSpec);

  expect(buildSpec.phases.pre_build.commands)
    .toContain('AWS_STS_REGIONAL_ENDPOINTS=legacy aws sts assume-role --role-arn \"arn:aws:role:to:assume\" --role-session-name \"my-session-name\"  > $creds');
});

test('assume role not supported on windows', () => {
  const stack = new Stack();

  expect(() => new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    platform: ShellPlatform.Windows,
    entrypoint: 'test.sh',
    assumeRole: {
      roleArn: 'arn:aws:role:to:assume',
      sessionName: 'my-session-name'
    }
  })).toThrow('assumeRole is not supported on Windows');
});

test('alarm options - defaults', () => {
  const stack = new Stack();

  new Shellable(stack, 'MyShellable', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
  });

  assert(stack).to(haveResource('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 1,
    Threshold: 1,
    Period: 300
  }));
});

test('alarm options - custom', () => {
  const stack = new Stack();

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
    Period: 3600
  }));
});

test('privileged mode', () => {
  const stack = new Stack();

  new Shellable(stack, 'AllowDocker', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    privileged: true
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project', {
    Environment: {
      PrivilegedMode: true
    }
  }, ResourcePart.Properties, true));
});

test('environment variables', () => {
  const stack = new Stack();

  new Shellable(stack, 'EnvironmentVariables', {
    scriptDirectory: path.join(__dirname, 'delivlib-tests/linux'),
    entrypoint: 'test.sh',
    environment: {
      ENV_VAR: 'env-var-value',
    },
    environmentSecrets: {
      ENV_VAR_SECRET: 'env-var-secret-name',
    },
    environmentParameters: {
      ENV_VAR_PARAMETER: 'env-var-parameter-name'
    },
  });

  assert(stack).to(haveResource('AWS::CodeBuild::Project', {
    Environment: {
      EnvironmentVariables: [
        {
          Name: "SCRIPT_S3_BUCKET",
          Type: "PLAINTEXT",
          Value: {
            Ref: "AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC"
          }
        },
        {
          Name: "SCRIPT_S3_KEY",
          Type: "PLAINTEXT",
          Value: { "Fn::Join": [ "", [{ "Fn::Select": [ 0, { "Fn::Split": [ "||", {
            Ref: "AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3VersionKeyF3F83F76"
          }]}]}, { "Fn::Select": [ 1, { "Fn::Split": [ "||", {
            Ref: "AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3VersionKeyF3F83F76"
          }]}]}]]}
        },
        {
          Name: 'ENV_VAR',
          Type: 'PLAINTEXT',
          Value: 'env-var-value'
        },
        {
          Name: 'ENV_VAR_SECRET',
          Type: 'SECRETS_MANAGER',
          Value: 'env-var-secret-name'
        },
        {
          Name: 'ENV_VAR_PARAMETER',
          Type: 'PARAMETER_STORE',
          Value: 'env-var-parameter-name'
        },
      ]
    }
  }, ResourcePart.Properties, true));

  assert(stack).to(haveResource('AWS::IAM::Policy', {
    "PolicyDocument": {
      "Statement": [
        {
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Effect": "Allow",
          "Resource": [
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":logs:",
                  {
                    "Ref": "AWS::Region"
                  },
                  ":",
                  {
                    "Ref": "AWS::AccountId"
                  },
                  ":log-group:/aws/codebuild/",
                  {
                    "Ref": "EnvironmentVariablesD266B682"
                  }
                ]
              ]
            },
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":logs:",
                  {
                    "Ref": "AWS::Region"
                  },
                  ":",
                  {
                    "Ref": "AWS::AccountId"
                  },
                  ":log-group:/aws/codebuild/",
                  {
                    "Ref": "EnvironmentVariablesD266B682"
                  },
                  ":*"
                ]
              ]
            }
          ]
        },
        {
          "Action": [
            "codebuild:CreateReportGroup",
            "codebuild:CreateReport",
            "codebuild:UpdateReport",
            "codebuild:BatchPutTestCases"
          ],
          "Effect": "Allow",
          "Resource": {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  "Ref": "AWS::Partition"
                },
                ":codebuild:",
                {
                  "Ref": "AWS::Region"
                },
                ":",
                {
                  "Ref": "AWS::AccountId"
                },
                ":report-group/",
                {
                  "Ref": "EnvironmentVariablesD266B682"
                },
                "-*"
              ]
            ]
          }
        },
        {
          "Action": [
            "s3:GetObject*",
            "s3:GetBucket*",
            "s3:List*"
          ],
          "Effect": "Allow",
          "Resource": [
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":s3:::",
                  {
                    "Ref": "AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC"
                  }
                ]
              ]
            },
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    "Ref": "AWS::Partition"
                  },
                  ":s3:::",
                  {
                    "Ref": "AssetParameters3d34b07ba871989d030649c646b3096ba7c78ca531897bcdb0670774d2f9d3e4S3BucketDA91EFBC"
                  },
                  "/*"
                ]
              ]
            }
          ]
        },
        {
          "Action": [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret"
          ],
          "Effect": "Allow",
          "Resource": "env-var-secret-name"
        },
        {
          "Action": [
            "ssm:DescribeParameters",
            "ssm:GetParameters",
            "ssm:GetParameter",
            "ssm:GetParameterHistory"
          ],
          "Effect": "Allow",
          "Resource": {
            "Fn::Join": [
              "",
              [
                "arn:",
                {
                  "Ref": "AWS::Partition"
                },
                ":ssm:",
                {
                  "Ref": "AWS::Region"
                },
                ":",
                {
                  "Ref": "AWS::AccountId"
                },
                ":parameter/env-var-parameter-name"
              ]
            ]
          }
        }
      ],
      "Version": "2012-10-17"
    },
    PolicyName: "EnvironmentVariablesRoleDefaultPolicy1BCDD5D0",
    Roles: [{ Ref: "EnvironmentVariablesRole93B5CD9F" }]
  }));
});
