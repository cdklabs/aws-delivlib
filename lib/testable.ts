import cbuild = require('@aws-cdk/aws-codebuild');
import cpipeline = require('@aws-cdk/aws-codepipeline');
import cpipelineapi = require('@aws-cdk/aws-codepipeline-api');
import cdk = require('@aws-cdk/cdk');
import { PlatformType, Shellable, ShellPlatform } from './shellable';

export interface TestableProps {
  platform: ShellPlatform;
  variables?: { [key: string]: cbuild.BuildEnvironmentVariable };
  testDirectory: string;

  /**
   * The script to run.
   * @default "test.sh" for Linux or "test.ps1" for Windows
   */
  entrypoint?: string;
}

export class Testable extends cdk.Construct {
  public readonly project: cbuild.Project;

  private readonly shellable: Shellable;

  constructor(parent: cdk.Construct, id: string, props: TestableProps) {
    super(parent, id);

    const entrypoint =  props.entrypoint ||
      (props.platform.platformType === PlatformType.Linux ? 'test.sh' : 'test.ps1');

    this.shellable = new Shellable(this, 'Resource', {
      platform: props.platform,
      environmentVariables: props.variables,
      scriptDirectory: props.testDirectory,
      entrypoint,
    });

    this.project = this.shellable.project;
  }

  public addToPipeline(stage: cpipeline.Stage, inputArtifact: cpipelineapi.Artifact) {
    this.shellable.addToPipeline(stage, `Test${this.id}`, inputArtifact);
  }
}
