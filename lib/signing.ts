import * as path from 'path';
import { IBuildImage, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, IStage } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct, IConstruct } from 'constructs';
import { AddToPipelineOptions } from './pipeline';
import { LinuxPlatform, Shellable } from './shellable';

export interface ISigner extends IConstruct {
  addToPipeline(stage: IStage, id: string, options: AddToPipelineOptions): void;
}

export interface AddSigningOptions {
  /**
   * The input artifact to use
   *
   * @default Build output artifact
   */
  readonly inputArtifact?: Artifact;

  /**
   * Stage name to add publishing job to
   *
   * By default, this will be the stage name `'Publish'`, but if you want to
   * separate out the publishing actions into different stages (in order to
   * block/unblock them separately for example) you can change this.
   *
   * Stages appear in the pipeline in the order they are referenced for
   * the first time.
   *
   * @default "Sign"
   */
  readonly stageName?: string;
}

export interface SignNuGetWithSignerProps {
  /**
   * An S3 bucket used to store signed and unsigned DLL files
   */
  readonly signingBucket: IBucket;

  /**
   * A Lambda function used to perform signing operations with AWS Signer
   */
  readonly signingLambda: IFunction;

  /**
   * A role used provide access to the signing bucket and signing lambda
   */
  readonly signingAccessRole: IRole;

  /**
   * The build image to do the publishing in
   *
   * Needs to have NuGet preinstalled.
   *
   * @default Latest superchain
   */
  readonly buildImage?: IBuildImage;
}

export class SignNuGetWithSigner extends Construct implements ISigner {
  public readonly role: IRole;
  public readonly project: Project;

  public constructor(scope: Construct, id: string, props: SignNuGetWithSignerProps) {
    super(scope, id);

    const environment = {
      SIGNING_BUCKET_ARN: props.signingBucket.bucketArn,
      SIGNING_LAMBDA_ARN: props.signingLambda.functionArn,
      SIGNING_ACCESS_ROLE_ARN: props.signingAccessRole.roleArn,
    };

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(props.buildImage ?? LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-buster-slim-node18')),
      scriptDirectory: path.join(__dirname, 'publishing', 'nuget'),
      entrypoint: 'sign-with-signer.sh',
      environment,
    });

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: IStage, id: string, options: AddToPipelineOptions) {
    stage.addAction(new CodeBuildAction({
      actionName: id,
      input: options.inputArtifact || new Artifact(),
      runOrder: options.runOrder,
      project: this.project,
    }));
  }
}