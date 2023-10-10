import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Pipeline } from '../pipeline';
import { CodeCommitRepo } from '../repo';

describe('with standard pipeline', () => {
  let stack: Stack;
  let pipeline: Pipeline;
  beforeEach(() => {
    const app = new App();
    stack = new Stack(app, 'TestStack');

    pipeline = new Pipeline(stack, 'TestPipeline', {
      repo: new CodeCommitRepo(new Repository(stack, 'Repo', { repositoryName: 'test' })),
    });
  });

  test('can configure project and sign stage for NuGet signing', () => {
    // GIVEN
    const signingBucket = Bucket.fromBucketName(stack, 'SigningBucket', 'signing-bucket');
    const signingLambda = Function.fromFunctionName(stack, 'SigningLambda', 'signing-lambda');
    const accessRole = Role.fromRoleName(stack, 'AccessRole', 'access-role');

    // WHEN
    pipeline.signNuGetWithSigner({
      signingBucket,
      signingLambda,
      accessRole,
    });

    // THEN
    // verify the sign codebuild project is configured correctly
    Template.fromStack(stack).hasResourceProperties('AWS::CodeBuild::Project', {
      Artifacts: {
        Type: 'NO_ARTIFACTS',
      },
      Environment: {
        ComputeType: 'BUILD_GENERAL1_MEDIUM',
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
            Value: '304990045086f467d5effaa1d1aa90d3f19411750a41f9cb37ab387399f92e39.zip',
          },
          {
            Name: 'SIGNING_BUCKET_NAME',
            Type: 'PLAINTEXT',
            Value: 'signing-bucket',
          },
          {
            Name: 'SIGNING_LAMBDA_ARN',
            Type: 'PLAINTEXT',
            Value: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':lambda:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':function:signing-lambda',
                ],
              ],
            },
          },
          {
            Name: 'ACCESS_ROLE_ARN',
            Type: 'PLAINTEXT',
            Value: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':role/access-role',
                ],
              ],
            },
          },
        ],
        Image: 'public.ecr.aws/jsii/superchain:1-buster-slim-node18',
        ImagePullCredentialsType: 'SERVICE_ROLE',
        PrivilegedMode: false,
        Type: 'LINUX_CONTAINER',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'TestPipelineNuGetSigningRole00994E45',
          'Arn',
        ],
      },
      Source: {
        BuildSpec: '{\n  \"version\": \"0.2\",\n  \"phases\": {\n    \"install\": {\n      \"commands\": [\n        \"command -v yarn > /dev/null || npm install --global yarn\"\n      ]\n    },\n    \"pre_build\": {\n      \"commands\": [\n        \"echo \\\"Downloading scripts from s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY}\\\"\",\n        \"aws s3 cp s3://${SCRIPT_S3_BUCKET}/${SCRIPT_S3_KEY} /tmp\",\n        \"mkdir -p /tmp/scriptdir\",\n        \"unzip /tmp/$(basename $SCRIPT_S3_KEY) -d /tmp/scriptdir\"\n      ]\n    },\n    \"build\": {\n      \"commands\": [\n        \"export SCRIPT_DIR=/tmp/scriptdir\",\n        \"echo \\\"Running sign.sh\\\"\",\n        \"/bin/bash /tmp/scriptdir/sign.sh\"\n      ]\n    }\n  },\n  \"artifacts\": {\n    \"files\": [\n      \"**/*\"\n    ],\n    \"base-directory\": \".\"\n  }\n}',
        Type: 'NO_SOURCE',
      },
      Cache: {
        Type: 'NO_CACHE',
      },
      EncryptionKey: {
        'Fn::GetAtt': [
          'TestPipelineBuildPipelineArtifactsBucketEncryptionKeyCD151124',
          'Arn',
        ],
      },
    });

    // verify the sign stage is added to pipeline
    Template.fromStack(stack).hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Source',
                Owner: 'AWS',
                Provider: 'CodeCommit',
                Version: '1',
              },
              Configuration: {
                RepositoryName: {
                  'Fn::GetAtt': [
                    'Repo02AC86CF',
                    'Name',
                  ],
                },
                BranchName: 'master',
                PollForSourceChanges: false,
              },
              Name: 'Pull',
              OutputArtifacts: [
                {
                  Name: 'Source',
                },
              ],
              RoleArn: {
                'Fn::GetAtt': [
                  'TestPipelineBuildPipelineSourcePullCodePipelineActionRoleE3FDD1B5',
                  'Arn',
                ],
              },
              RunOrder: 1,
            },
          ],
          Name: 'Source',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
                Provider: 'CodeBuild',
                Version: '1',
              },
              Configuration: {
                ProjectName: {
                  Ref: 'TestPipelineBuildProject799CEA07',
                },
              },
              InputArtifacts: [
                {
                  Name: 'Source',
                },
              ],
              RoleArn: {
                'Fn::GetAtt': [
                  'TestPipelineBuildPipelineBuildCodePipelineActionRole7BE59F77',
                  'Arn',
                ],
              },
              RunOrder: 1,
            },
          ],
          Name: 'Build',
        },
        {
          Actions: [
            {
              ActionTypeId: {
                Category: 'Build',
                Owner: 'AWS',
                Provider: 'CodeBuild',
                Version: '1',
              },
              Configuration: {
                ProjectName: {
                  Ref: 'TestPipelineNuGetSigningCE9AB81F',
                },
              },
              InputArtifacts: [
                {
                  Name: 'Artifact_Build_Build',
                },
              ],
              Name: 'NuGetSigningSign',
              OutputArtifacts: [
                {
                  Name: 'Artifact_Sign_NuGetSigningSign',
                },
              ],
              RoleArn: {
                'Fn::GetAtt': [
                  'TestPipelineBuildPipelineSignNuGetSigningSignCodePipelineActionRoleDD2CA5AF',
                  'Arn',
                ],
              },
              RunOrder: 1,
            },
          ],
          Name: 'Sign',
        },
      ],
    });
  });
});
