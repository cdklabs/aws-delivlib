import * as path from 'path';
import { App, Stack, aws_events as events } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Canary } from '../../lib';


const testDir = path.join(__dirname, 'delivlib-tests', 'linux');

test('correctly creates canary', () => {
  // GIVEN
  const stack = new Stack(new App(), 'TestStack');
  // WHEN
  new Canary(stack, 'Canary', {
    schedule: events.Schedule.expression('rate(1 minute)'),
    scriptDirectory: testDir,
    entrypoint: 'test.sh',
  });
  const template = Template.fromStack(stack);
  // THEN
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    EvaluationPeriods: 1,
    Threshold: 1,
    Dimensions: [{
      Name: 'ProjectName',
      Value: {
        Ref: 'CanaryShellableA135E79C',
      },
    }],
    MetricName: 'FailedBuilds',
    Namespace: 'AWS/CodeBuild',
    Statistic: 'Sum',
    TreatMissingData: 'ignore',
    Period: 300,
  });

  template.hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 minute)',
    State: 'ENABLED',
    Targets: [{
      Arn: {
        'Fn::GetAtt': [
          'CanaryShellableA135E79C',
          'Arn',
        ],
      },
      Id: 'Target0',
      RoleArn: {
        'Fn::GetAtt': [
          'CanaryShellableEventsRoleC4030D0D',
          'Arn',
        ],
      },
    }],
  });

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Artifacts: {
      Type: 'NO_ARTIFACTS',
    },
    Environment: {
      ComputeType: 'BUILD_GENERAL1_MEDIUM',
      Image: 'aws/codebuild/standard:7.0',
      PrivilegedMode: false,
      Type: 'LINUX_CONTAINER',
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
          Name: 'IS_CANARY',
          Type: 'PLAINTEXT',
          Value: 'true',
        },
      ],
    },
    ServiceRole: {
      'Fn::GetAtt': [
        'CanaryShellableRole063BC07D',
        'Arn',
      ],
    },
    Source: {
      // tslint:disable-next-line:max-line-length
      BuildSpec: '{\n  "version": "0.2",\n  "phases": {\n    "install": {\n      "commands": [\n        "command -v yarn > /dev/null || npm install --global yarn"\n      ]\n    },\n    "pre_build": {\n      "commands": [\n        "echo \\"Downloading scripts from s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY}\\"",\n        "aws s3 cp s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY} /tmp",\n        "mkdir -p /tmp/scriptdir",\n        "unzip /tmp/$(basename $SCRIPT_S3_KEY) -d /tmp/scriptdir"\n      ]\n    },\n    "build": {\n      "commands": [\n        "export SCRIPT_DIR=/tmp/scriptdir",\n        "echo \\"Running test.sh\\"",\n        "/bin/bash /tmp/scriptdir/test.sh"\n      ]\n    }\n  }\n}',
    },
  });
});
