import '@monocdk-experiment/assert/jest';
import * as path from 'path';
import { arrayWith } from '@monocdk-experiment/assert';
import {
  Stack,
  aws_codebuild as codebuild,
} from 'monocdk';
import { MirrorSource } from '../../lib/registry-sync';

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
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDirectory(path.join(__dirname, 'docker-asset'), 'myrepository');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('myrepository');
      expect(result.tag).toEqual('latest');
      const cmds = result.commands;
      expect(cmds.shift()).toMatch(/aws s3 cp s3:.* myrepository.zip/);
      expect(cmds).toEqual([
        'unzip myrepository.zip -d myrepository',
        'docker build --pull -t myregistry/myrepository:latest myrepository',
      ]);
    });

    test('explicit tag', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDirectory(path.join(__dirname, 'docker-asset'), 'myrepository', 'mytag');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('myrepository');
      expect(result.tag).toEqual('mytag');
      expect(result.commands[2]).toEqual('docker build --pull -t myregistry/myrepository:mytag myrepository');
    });

    test('syncJob is given permission to s3 asset', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDirectory(path.join(__dirname, 'docker-asset'), 'myrepository');
      const syncJob = new codebuild.Project(stack, 'SyncJob', {
        buildSpec: codebuild.BuildSpec.fromObject({}),
      });

      // WHEN
      source.bind({
        scope: stack,
        ecrRegistry,
        syncJob,
      });

      // THEN
      expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: arrayWith({
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
                      Ref: 'AssetParameterse8d9cb1c0103dbf504327aacfe6adaaaa0749014246bf11110b90ace9e5ee1c8S3BucketABAF9C0C',
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
                      Ref: 'AssetParameterse8d9cb1c0103dbf504327aacfe6adaaaa0749014246bf11110b90ace9e5ee1c8S3BucketABAF9C0C',
                    },
                    '/*',
                  ],
                ],
              },
            ],
          }),
        },
      });
    });
  });
});