import assets = require('@aws-cdk/assets-docker');
import cbuild = require('@aws-cdk/aws-codebuild');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { LinuxPlatform } from './shellable';

/**
 * Expose the superchain docker linux build image as a construct.
 */
export class Superchain extends LinuxPlatform {
  public static readonly UUID = 'ED3906BE-3B2E-4990-A6A9-3B3409FCB2C2';

  constructor(scope: cdk.Construct) {
    const stack = cdk.Stack.find(scope);
    const singleton = stack.node.tryFindChild(Superchain.UUID);
    if (singleton) {
      const asset = singleton as assets.DockerImageAsset;
      super(cbuild.LinuxBuildImage.fromDockerHub(asset.imageUri));
    } else {
      super(cbuild.LinuxBuildImage.fromAsset(stack, Superchain.UUID, {
        directory: path.join(__dirname, '..', 'superchain')
      }));
    }
  }
}
