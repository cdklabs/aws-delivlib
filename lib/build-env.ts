import { aws_codebuild as cbuild } from 'aws-cdk-lib';

export interface BuildEnvironmentProps {
  computeType?: cbuild.ComputeType;
  privileged?: boolean;
  /** @deprecated */
  env?: { [key: string]: string };
  environment?: { [key: string]: string };
  buildImage?: cbuild.IBuildImage;
}

export function createBuildEnvironment(props: BuildEnvironmentProps) {
  const environment: cbuild.BuildEnvironment = {
    computeType: props.computeType || cbuild.ComputeType.SMALL,
    privileged: props.privileged,
    environmentVariables: renderEnvironmentVariables({ ...props.environment, ...props.env }),
    buildImage: props.buildImage || cbuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:1-buster-slim'),
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
