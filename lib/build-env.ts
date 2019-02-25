import cbuild = require('@aws-cdk/aws-codebuild');
import cdk = require('@aws-cdk/cdk');
import { Superchain } from './superchain';

export interface BuildEnvironmentProps {
  computeType?: cbuild.ComputeType;
  privileged?: boolean;
  env?: { [key: string]: string };
  buildImage?: cbuild.IBuildImage;
}

export function createBuildEnvironment(scope: cdk.Construct, props: BuildEnvironmentProps) {
  const environment: cbuild.BuildEnvironment = {
    computeType: props.computeType || cbuild.ComputeType.Small,
    privileged: props.privileged,
    environmentVariables: renderEnvironmentVariables(props.env),
    buildImage: props.buildImage || new Superchain(scope).buildImage
  };

  return environment;
}

function renderEnvironmentVariables(env?: { [key: string]: string }) {
  if (!env) {
    return undefined;
  }

  const out: { [key: string]: cbuild.BuildEnvironmentVariable } = { };
  for (const [key, value] of Object.entries(env)) {
    out[key] = { value };
  }
  return out;
}