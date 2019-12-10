import cbuild = require('@aws-cdk/aws-codebuild');

export interface BuildEnvironmentProps {
  computeType?: cbuild.ComputeType;
  privileged?: boolean;
  env?: { [key: string]: string };
  buildImage?: cbuild.IBuildImage;
}

export function createBuildEnvironment(props: BuildEnvironmentProps) {
  const environment: cbuild.BuildEnvironment = {
    computeType: props.computeType || cbuild.ComputeType.SMALL,
    privileged: props.privileged,
    environmentVariables: renderEnvironmentVariables(props.env),
    buildImage: props.buildImage || cbuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain:latest'),
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
