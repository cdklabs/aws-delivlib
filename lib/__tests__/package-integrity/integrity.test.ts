import '@monocdk-experiment/assert/jest';
import {
  App, Stack,
  aws_codebuild as codebuild,
  aws_secretsmanager as sm,
} from 'monocdk';
import { LinuxPlatform, PackageIntegrityValidation } from '../..';

test('creates a codebuild project that triggers daily and runs the integrity handler', () => {

  const stack = new Stack(new App(), 'TestStack');
  const token = sm.Secret.fromSecretCompleteArn(stack, 'GitHubSecret', 'arn:aws:secretsmanager:us-east-1:123456789123:secret:github-token-000000');

  new PackageIntegrityValidation(stack, 'Integrity', {
    buildPlatform: new LinuxPlatform(codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim-node12')),
    githubTokenSecret: token,
    repository: 'cdklabs/some-repo',
  });

  expect(stack).toHaveResourceLike('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 day)',
    State: 'ENABLED',
    Targets: [
      {
        Arn: {
          'Fn::GetAtt': [
            'IntegrityD83C2C0B',
            'Arn',
          ],
        },
        Id: 'Target0',
        RoleArn: {
          'Fn::GetAtt': [
            'IntegrityEventsRole1990400F',
            'Arn',
          ],
        },
      },
    ],
  });

  expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
    Environment: {
      EnvironmentVariables: [
        {
          Name: 'SCRIPT_S3_BUCKET',
          Type: 'PLAINTEXT',
          Value: {
            Ref: 'AssetParameters3aa0e2ce781eaf8ef9100c3829b82a9b4161a0b8980f2c71b9da5385d339a96fS3Bucket30A82D26',
          },
        },
        {
          Name: 'SCRIPT_S3_KEY',
          Type: 'PLAINTEXT',
          Value: {
            'Fn::Join': [
              '',
              [
                {
                  'Fn::Select': [
                    0,
                    {
                      'Fn::Split': [
                        '||',
                        {
                          Ref: 'AssetParameters3aa0e2ce781eaf8ef9100c3829b82a9b4161a0b8980f2c71b9da5385d339a96fS3VersionKey0DF7A2D8',
                        },
                      ],
                    },
                  ],
                },
                {
                  'Fn::Select': [
                    1,
                    {
                      'Fn::Split': [
                        '||',
                        {
                          Ref: 'AssetParameters3aa0e2ce781eaf8ef9100c3829b82a9b4161a0b8980f2c71b9da5385d339a96fS3VersionKey0DF7A2D8',
                        },
                      ],
                    },
                  ],
                },
              ],
            ],
          },
        },
        {
          Name: 'GITHUB_REPOSITORY',
          Type: 'PLAINTEXT',
          Value: 'cdklabs/some-repo',
        },
        {
          Name: 'TAG_PREFIX',
          Type: 'PLAINTEXT',
          Value: '',
        },
        {
          Name: 'GITHUB_TOKEN_ARN',
          Type: 'PLAINTEXT',
          Value: 'arn:aws:secretsmanager:us-east-1:123456789123:secret:github-token-000000',
        },
      ],
    },
  });
});
