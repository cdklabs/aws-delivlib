import * as path from 'path';
import {
  Aspects, Duration, Stack,
  aws_codebuild as codebuild,
  aws_events as events,
  aws_secretsmanager as secrets,
} from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EcrMirror, EcrMirrorAspect, MirrorSource } from '../../../lib/registry-sync';

describe('EcrMirror', () => {
  test('default', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      sources: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.cron({}),
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        EnvironmentVariables: [
          {
            Name: 'DOCKERHUB_USERNAME',
            Type: 'SECRETS_MANAGER',
            Value: '123aass:username-key:AWSCURRENT',
          },
          {
            Name: 'DOCKERHUB_PASSWORD',
            Type: 'SECRETS_MANAGER',
            Value: '123aass:password-key:AWSCURRENT',
          },
        ],
        Image: 'public.ecr.aws/jsii/superchain:1-buster-slim-node18',
        RegistryCredential: {
          Credential: '123aass',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
      Source: {
        BuildSpec: {
          'Fn::Join': [
            '',
            [
              '{\n  "version": "0.2",\n  "phases": {\n    "build": {\n      "commands": [\n        "nohup /usr/bin/dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --storage-driver=overlay2&",\n        "timeout 15 sh -c \\"until docker info; do echo .; sleep 1; done\\"",\n        "docker login -u ${DOCKERHUB_USERNAME} -p ${DOCKERHUB_PASSWORD}",\n        "aws ecr get-login-password | docker login --username AWS --password-stdin ',
              {
                Ref: 'AWS::AccountId',
              },
              '.dkr.ecr.',
              {
                Ref: 'AWS::Region',
              },
              '.amazonaws.com",\n        "aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws",\n        "docker pull library/docker-image:latest",\n        "docker tag library/docker-image:latest ',
              {
                Ref: 'AWS::AccountId',
              },
              '.dkr.ecr.',
              {
                Ref: 'AWS::Region',
              },
              '.amazonaws.com/library/docker-image:latest",\n        "docker push ',
              {
                Ref: 'AWS::AccountId',
              },
              '.dkr.ecr.',
              {
                Ref: 'AWS::Region',
              },
              '.amazonaws.com/library/docker-image:latest",\n        "docker image prune --all --force"\n      ]\n    }\n  }\n}',
            ],
          ],
        },
      },
    });
  });

  test('autoStart', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      sources: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      autoStart: true,
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('Custom::AWS', 1);
    template.resourceCountIs('AWS::Events::Rule', 0);
  });

  test('schedule', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      sources: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.rate(Duration.hours(1)),
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 hour)',
    });

    template.resourceCountIs('Custom::AWS', 0);
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });

  test('errors on duplicate repository', () => {
    const stack = new Stack();
    expect(() => new EcrMirror(stack, 'EcrRegistrySync', {
      sources: [
        MirrorSource.fromDockerHub('my/docker-image'),
        MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'my/docker-image'),
      ],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.rate(Duration.hours(1)),
    })).toThrow(/Mirror source.*already exists/);
  });

  describe('ecrRepository()', () => {
    test('default', () => {
      const stack = new Stack();
      const image = MirrorSource.fromDockerHub('my/docker-image');
      const registry = new EcrMirror(stack, 'EcrRegistrySync', {
        sources: [image],
        dockerHubCredentials: {
          usernameKey: 'username-key',
          passwordKey: 'password-key',
          secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
        },
        schedule: events.Schedule.cron({}),
      });

      const repo = registry.ecrRepository('my/docker-image');
      expect(repo).toBeDefined();
      expect(stack.resolve(repo!.repositoryArn)).toEqual({
        'Fn::GetAtt': ['EcrRegistrySyncRepomydockerimageCE3ABCA6', 'Arn'],
      });
    });

    test('returning a mirrored repository does not depend on the tag', () => {
      const stack = new Stack();
      const image = MirrorSource.fromDockerHub('my/docker-image', 'mytag');
      const registry = new EcrMirror(stack, 'EcrRegistrySync', {
        sources: [image],
        dockerHubCredentials: {
          usernameKey: 'username-key',
          passwordKey: 'password-key',
          secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
        },
        schedule: events.Schedule.cron({}),
      });

      expect(registry.ecrRepository('my/docker-image')).toBeDefined();
    });
  });

  test('schedule and/or autoStart', () => {
    const stack = new Stack();
    const image = MirrorSource.fromDockerHub('my/docker-image');
    expect(() => new EcrMirror(stack, 'EcrRegistrySync', {
      sources: [image],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
    })).toThrow(/schedule or autoStart/);
  });
});

describe('EcrMirrorAspect', () => {
  test('applies to relevant codebuild projects', () => {
    // GIVEN
    const stack = new Stack();
    const mirror = new EcrMirror(stack, 'Mirror', {
      sources: [MirrorSource.fromDockerHub('my/docker-image')],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.cron({}),
    });
    new codebuild.Project(stack, 'MyDockerImageProject', {
      buildSpec: codebuild.BuildSpec.fromObject({}),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('my/docker-image'),
      },
    });

    // WHEN
    Aspects.of(stack).add(new EcrMirrorAspect(mirror));

    const template = Template.fromStack(stack);

    // THEN
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        Image: {
          'Fn::Join': [
            '',
            [
              {
                'Fn::Select': [
                  4,
                  {
                    'Fn::Split': [
                      ':',
                      { 'Fn::GetAtt': ['MirrorRepomydockerimageE8DCCA4F', 'Arn'] },
                    ],
                  },
                ],
              },
              '.dkr.ecr.',
              {
                'Fn::Select': [
                  3,
                  {
                    'Fn::Split': [
                      ':',
                      { 'Fn::GetAtt': ['MirrorRepomydockerimageE8DCCA4F', 'Arn'] },
                    ],
                  },
                ],
              },
              '.',
              { Ref: 'AWS::URLSuffix' },
              '/',
              { Ref: 'MirrorRepomydockerimageE8DCCA4F' },
              ':latest',
            ],
          ],
        },
      },
    });
  });

  test('does not affect unrelated codebuild projects', () => {
    // GIVEN
    const stack = new Stack();
    const mirror = new EcrMirror(stack, 'Mirror', {
      sources: [MirrorSource.fromDockerHub('my/docker-image')],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.cron({}),
    });
    new codebuild.Project(stack, 'UnrelatedProject', {
      buildSpec: codebuild.BuildSpec.fromObject({}),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('unrelated/image'),
      },
    });
    const template = Template.fromStack(stack);

    // WHEN
    Aspects.of(stack).add(new EcrMirrorAspect(mirror));

    // THEN
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'unrelated/image',
      },
    });
  });

  test('can mirror multiple tags from same repository', () => {
    // GIVEN
    const stack = new Stack(undefined, 'Stack', {
      env: { account: 'account', region: 'region' },
    });
    new EcrMirror(stack, 'Mirror', {
      sources: [
        MirrorSource.fromDockerHub('my/docker-image'),
        MirrorSource.fromDockerHub('my/docker-image', 'some_tag'),
      ],
      dockerHubCredentials: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretPartialArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.cron({}),
    });
    const template = Template.fromStack(stack);

    // THEN: one repo that mirrors both tags
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'my/docker-image',
    });
    template.resourceCountIs('AWS::ECR::Repository', 1);

    // Have both pushes in the project buildspec
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: {
        BuildSpec: Match.serializedJson(Match.objectLike({
          phases: {
            build: {
              commands: Match.arrayWith([
                'docker push account.dkr.ecr.region.amazonaws.com/my/docker-image:latest',
                'docker push account.dkr.ecr.region.amazonaws.com/my/docker-image:some_tag',
              ]),
            },
          },
        })),
      },
    });
  });
});
