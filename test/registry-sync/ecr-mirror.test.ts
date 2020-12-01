import '@monocdk-experiment/assert/jest';
import {
  Aspects, Duration, Stack,
  aws_codebuild as codebuild,
  aws_events as events,
  aws_secretsmanager as secrets,
} from 'monocdk';
import { EcrMirror, EcrMirrorAspect, MirrorSource } from '../../lib/registry-sync';

describe('EcrMirror', () => {
  test('default', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      images: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCreds: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
    });

    expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
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
        Image: 'jsii/superchain',
        RegistryCredential: {
          Credential: 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass',
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
              '.amazonaws.com",\n        "docker pull library/docker-image:latest",\n        "docker tag library/docker-image:latest ',
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

    expect(stack).not.toHaveResource('Custom::AWS');
    expect(stack).not.toHaveResource('AWS::Lambda::Function');
    expect(stack).not.toHaveResource('AWS::Events::Rule');
  });

  test('autoStart', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      images: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCreds: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      autoStart: true,
    });

    expect(stack).toHaveResource('Custom::AWS');
  });

  test('schedule', () => {
    const stack = new Stack();
    new EcrMirror(stack, 'EcrRegistrySync', {
      images: [MirrorSource.fromDockerHub('docker-image')],
      dockerHubCreds: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
      schedule: events.Schedule.rate(Duration.hours(1)),
    });

    expect(stack).toHaveResource('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 hour)',
    });
  });

  describe('ecrRepository()', () => {
    test('default', () => {
      const stack = new Stack();
      const image = MirrorSource.fromDockerHub('my/docker-image');
      const registry = new EcrMirror(stack, 'EcrRegistrySync', {
        images: [image],
        dockerHubCreds: {
          usernameKey: 'username-key',
          passwordKey: 'password-key',
          secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
        },
      });

      const repo = registry.ecrRepository('my/docker-image');
      expect(repo).toBeDefined();
      expect(stack.resolve(repo!.repositoryArn)).toEqual({
        'Fn::GetAtt': ['EcrRegistrySyncRepomydockerimageCE3ABCA6', 'Arn'],
      });
    });

    test('undefined when image is not recognized', () => {
      const stack = new Stack();
      const image = MirrorSource.fromDockerHub('my/docker-image');
      const registry = new EcrMirror(stack, 'EcrRegistrySync', {
        images: [image],
        dockerHubCreds: {
          usernameKey: 'username-key',
          passwordKey: 'password-key',
          secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
        },
      });

      expect(registry.ecrRepository('my/docker-image', 'mytag')).toBeUndefined();
    });

    test('tag is recognized', () => {
      const stack = new Stack();
      const image = MirrorSource.fromDockerHub('my/docker-image', 'mytag');
      const registry = new EcrMirror(stack, 'EcrRegistrySync', {
        images: [image],
        dockerHubCreds: {
          usernameKey: 'username-key',
          passwordKey: 'password-key',
          secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
        },
      });

      expect(registry.ecrRepository('my/docker-image', 'mytag')).toBeDefined();
      expect(registry.ecrRepository('my/docker-image')).toBeUndefined();
    });
  });
});

describe('EcrMirrorAspect', () => {
  test('applies to relevant codebuild projects', () => {
    // GIVEN
    const stack = new Stack();
    const mirror = new EcrMirror(stack, 'Mirror', {
      images: [MirrorSource.fromDockerHub('my/docker-image')],
      dockerHubCreds: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
    });
    new codebuild.Project(stack, 'MyDockerImageProject', {
      buildSpec: codebuild.BuildSpec.fromObject({}),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('my/docker-image'),
      },
    });

    // WHEN
    Aspects.of(stack).add(new EcrMirrorAspect(mirror));

    // THEN
    expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
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
      images: [MirrorSource.fromDockerHub('my/docker-image')],
      dockerHubCreds: {
        usernameKey: 'username-key',
        passwordKey: 'password-key',
        secret: secrets.Secret.fromSecretArn(stack, 'DockerhubSecret', 'arn:aws:secretsmanager:us-west-2:111122223333:secret:123aass'),
      },
    });
    new codebuild.Project(stack, 'UnrelatedProject', {
      buildSpec: codebuild.BuildSpec.fromObject({}),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('unrelated/image'),
      },
    });

    // WHEN
    Aspects.of(stack).add(new EcrMirrorAspect(mirror));

    // THEN
    expect(stack).toHaveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'unrelated/image',
      },
    });
  });
});