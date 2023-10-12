import * as path from 'path';
import { IBuildImage, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, IStage } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct, IConstruct } from 'constructs';
import { BuildSpec } from './build-spec';
import { AddToPipelineOptions } from './pipeline';
import { LinuxPlatform, Shellable } from './shellable';

export interface ISigner extends IConstruct {
  addToPipeline(stage: IStage, id: string, options: AddToPipelineOptions): Artifact;
}

export interface AddSigningOptions {
  /**
   * The input artifact to use
   *
   * @default Build output artifact
   */
  readonly inputArtifact?: Artifact;

  /**
   * Stage name to add signing job to
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
  readonly accessRole: IRole;

  /**
   * The name of the signer profile to use for signing
   *
   * @default no signing profile name
   */
  readonly signerProfileName?: string;

  /**
   * The owner of the signer profile to use for signing
   *
   * @default no signing profile owner
   */
  readonly signerProfileOwner?: string;
  
  /*
   * The service role that will be used to allow CodeBuild to perform operations
   * on your behalf.
   *
   * @default A role will be created
   */
  readonly serviceRole?: IRole;

  /**
   * The build image to do the signing in
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

    const environment: { [key: string]: string } = {
      SIGNING_BUCKET_NAME: props.signingBucket.bucketName,
      SIGNING_LAMBDA_ARN: props.signingLambda.functionArn,
      ACCESS_ROLE_ARN: props.accessRole.roleArn,
    };

    if (props.signerProfileName) {
      environment.SIGNER_PROFILE_NAME = props.signerProfileName;
    }

    if (props.signerProfileOwner) {
      environment.SIGNER_PROFILE_OWNER = props.signerProfileOwner;
    }

    const shellable = new Shellable(this, 'Default', {
      platform: new LinuxPlatform(props.buildImage ?? LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-buster-slim-node18')),
      scriptDirectory: path.join(__dirname, 'signing', 'nuget'),
      entrypoint: 'sign.sh',
      serviceRole: props.serviceRole,
      buildSpec: BuildSpec.literal({
        version: '0.2',
        artifacts: {
          files: ['**/*'],
          ['base-directory']: '.',
        },
      }),
      environment,
    });

    this.role = shellable.role;
    this.project = shellable.project;
  }

  public addToPipeline(stage: IStage, id: string, options: AddToPipelineOptions) {
    const signingInput = options.inputArtifact || new Artifact();
    const signingOutput = new Artifact();

    stage.addAction(new CodeBuildAction({
      actionName: id,
      input: signingInput,
      runOrder: options.runOrder,
      project: this.project,
      outputs: [signingOutput],
    }));

    return signingOutput;
  }
}