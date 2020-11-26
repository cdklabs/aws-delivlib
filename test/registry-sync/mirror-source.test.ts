import '@monocdk-experiment/assert/jest';
import * as path from 'path';
import {
  Stack,
} from 'monocdk';
import { MirrorSource } from '../../lib/registry-sync';

describe('RegistryImageSource', () => {
  describe('fromDockerHub', () => {
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
    });

    test('explicit tag', () => {
      // GIVEN
      const stack = new Stack();
      const ecrRegistry = 'myregistry';
      const source = MirrorSource.fromDockerHub('jsii/superchain:mytag');

      // WHEN
      const result = source.bind({
        scope: stack,
        ecrRegistry,
      });

      // THEN
      expect(result.repositoryName).toEqual('jsii/superchain');
      expect(result.tag).toEqual('mytag');
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
    });
  });

  describe('fromDirectory', () => {
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
    });
  });
});