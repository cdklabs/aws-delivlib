import cbuild = require('@aws-cdk/aws-codebuild');
import cdk = require('@aws-cdk/cdk');
import path = require('path');
import { LinuxPlatform } from './shellable';

/**
 * Expose the superchain docker linux build image as a construct.
 */
export class Superchain extends cdk.Construct {
  public readonly platform: LinuxPlatform;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    this.platform = new LinuxPlatform(cbuild.LinuxBuildImage.fromAsset(this, 'Image', {
      directory: path.join(__dirname, '..', 'superchain')
    }));
  }
}
