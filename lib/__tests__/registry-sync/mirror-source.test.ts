import * as path from 'path';
import {
  Stack, App,
  aws_codebuild as codebuild,
} from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MirrorSource } from '../../../lib/registry-sync';

describe('RegistryImageSource', () => {
  describe('fromDockerHub()', () => {
    test('default', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDockerHub('jsii/superchain');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('jsii/superchain');
      expect(result.tag).toEqual('latest');
      expect(result.commands).toEqual([
        'docker pull jsii/superchain:latest',
        'docker tag jsii/superchain:latest myregistry/jsii/superchain:latest',
      ]);
    });

    test('explicit tag', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDockerHub('jsii/superchain', 'mytag');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('jsii/superchain');
      expect(result.tag).toEqual('mytag');
      expect(result.commands).toEqual([
        'docker pull jsii/superchain:mytag',
        'docker tag jsii/superchain:mytag myregistry/jsii/superchain:mytag',
      ]);
    });

    test('official image', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDockerHub('superchain');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('library/superchain');
      expect(result.commands).toEqual([
        'docker pull library/superchain:latest',
        'docker tag library/superchain:latest myregistry/library/superchain:latest',
      ]);
    });

    test('fails if image includes tag', () => {
      expect(() => MirrorSource.fromDockerHub('superchain:latest')).toThrow(/image must not include tag/);
    });
  });

  describe('fromDirectory()', () => {
    test('default', () => {
      // GIVEN
      const app = new App();
      const stack = new Stack(app, 'Default', {
        env: {
          account: '111111111111',
          region: 'us-east-1',
        },
      });
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('myrepository');
      expect(result.tag).toEqual('latest');
      expect(result.commands).toEqual([
        'rm -rf myrepository.zip myrepository',
        expect.stringMatching(/aws s3 cp s3:.* myrepository.zip/),
        'unzip myrepository.zip -d myrepository',
        'docker build --pull -t myregistry/myrepository:latest myrepository',
      ]);
    });

    test('explicit tag', () => {
      // GIVEN
      const app = new App();
      const stack = new Stack(app, 'Default', {
        env: {
          account: '111111111111',
          region: 'us-east-1',
        },
      });
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository', { tag: 'mytag' });

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('myrepository');
      expect(result.tag).toEqual('mytag');
      expect(result.commands).toEqual([
        'rm -rf myrepository.zip myrepository',
        expect.stringMatching(/aws s3 cp s3:.* myrepository.zip/),
        'unzip myrepository.zip -d myrepository',
        'docker build --pull -t myregistry/myrepository:mytag myrepository',
      ]);
    });

    test('syncJob is given permission to s3 asset', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository');
      const syncJob = new codebuild.Project(stack, 'SyncJob', {
        buildSpec: codebuild.BuildSpec.fromObject({}),
      });

      // WHEN
      source.bind({
        scope: stack,
        ecrRegistry,
        syncJob,
      });

      const template = Template.fromStack(stack);

      // THEN
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([{
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
                    'arn:', { Ref: 'AWS::Partition' }, ':s3:::',
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
                    'arn:', { Ref: 'AWS::Partition' }, ':s3:::',
                    {
                      'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                    },
                    '/*',
                  ],
                ],
              },
            ],
          }]),
        },
      });
    });

    test('build args', () => {
      // GIVEN
      const app = new App();
      const stack = new Stack(app, 'Default', {
        env: {
          account: '111111111111',
          region: 'us-east-1',
        },
      });
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository', {
        buildArgs: {
          arg1: 'val1',
          arg2: 'val2',
        },
      });
      const syncJob = new codebuild.Project(stack, 'SyncJob', {
        buildSpec: codebuild.BuildSpec.fromObject({}),
      });

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
        syncJob,
      });


      // THEN
      expect(result.commands).toEqual([
        'rm -rf myrepository.zip myrepository',
        expect.stringMatching(/aws s3 cp s3:.* myrepository.zip/),
        'unzip myrepository.zip -d myrepository',
        'docker build --pull -t myregistry/myrepository:latest --build-arg arg1=val1 --build-arg arg2=val2 myrepository',
      ]);
    });

    test('can bind the same directory twice if they have different build args', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source1 = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository');
      const source2 = MirrorSource.fromDir(path.join(__dirname, 'docker-asset'), 'myrepository', {
        buildArgs: {
          arg1: 'val1',
          arg2: 'val2',
        },
      });

      // WHEN
      source1.bind({ scope: stack, ecrRegistry });
      source2.bind({ scope: stack, ecrRegistry });

      // THEN -- didn't throw
    });
  });
});
