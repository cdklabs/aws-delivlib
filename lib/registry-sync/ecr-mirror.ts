import {
  Construct, Stack,
  aws_ecr as ecr,
  aws_codebuild as codebuild,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_s3_assets as s3Assets,
  aws_secretsmanager as sm,
  custom_resources as cr,
} from 'monocdk';
import { MirrorSource } from './mirror-source';

/**
 * Authentication details for DockerHub.
 *
 * @see https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec.env.secrets-manager
 */
export interface DockerHubCredentials {

  /**
   * The secret that contains the username and password for Dockerhub
   */
  readonly secret: sm.ISecret;

  /**
   * The secret key that contains the username in the specified secret.
   */
  readonly usernameKey: string;

  /**
   * The secret key that contains the password in the specified secret.
   */
  readonly passwordKey: string;

  /**
   * Version stage of the secret.
   *
   * @default 'AWSCURRENT'
   */
  readonly versionStage?: string;
}

/**
 * Properties to initialize EcrRegistrySync
 */
export interface EcrMirrorProps {
  /**
   * The list of images to keep sync'ed.
   */
  readonly images: MirrorSource[];

  /**
   * Credentials to signing into Dockerhub.
   */
  readonly dockerHubCreds: DockerHubCredentials;

  /**
   * Sync job runs on a schedule.
   * @default - does not run on schedule
   */
  readonly schedule?: events.Schedule;

  /**
   * Start the sync job immediately after the deployment.
   * @default false
   */
  readonly autoStart?: boolean;
}

/**
 * Synchronize images from DockerHub to an ECR registry in the AWS account.
 * This is particularly useful to workaround DockerHub's throttling on pulls and use ECR instead.
 */
export class EcrMirror extends Construct {

  private readonly _repos: Map<string, ecr.IRepository> = new Map();
  private readonly _project: codebuild.Project;

  constructor(scope: Construct, id: string, props: EcrMirrorProps) {
    super(scope, id);

    const ecrRegistry = `${Stack.of(scope).account}.dkr.ecr.${Stack.of(scope).region}.amazonaws.com`;
    const commands = [];
    const assets = new Array<s3Assets.Asset>();

    for (const image of props.images) {
      const result = image.bind({
        scope: this,
        ecrRegistry,
      });
      commands.push(...result.commands);

      // remember the repos so that we can `grantPull` later on.
      this._repos.set(`${result.repositoryName}@${result.tag}`, new ecr.Repository(this, `Repo${result.repositoryName}`, {
        repositoryName: result.repositoryName,
      }));

      const ecrImageUri = `${ecrRegistry}/${result.repositoryName}:${result.tag}`;
      commands.push(`docker push ${ecrImageUri}`);

      // clean after each push so that we don't fillup disk space
      // possibly failing the next pull.
      commands.push('docker image prune --all --force');
    }

    const codeBuildSecretValue = (key: string, auth: DockerHubCredentials) => {
      return `${props.dockerHubCreds.secret.secretName}:${key}:${auth.versionStage ?? 'AWSCURRENT'}`;
    };

    const username = codeBuildSecretValue(props.dockerHubCreds.usernameKey, props.dockerHubCreds);
    const password = codeBuildSecretValue(props.dockerHubCreds.passwordKey, props.dockerHubCreds);

    this._project = new codebuild.Project(this, 'EcrPushImages', {
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain', {
          secretsManagerCredentials: props.dockerHubCreds.secret,
        }),
      },
      environmentVariables: {
        // DockerHub credentials to avoid throttling
        DOCKERHUB_USERNAME: { value: username, type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
        DOCKERHUB_PASSWORD: { value: password, type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [

              // start the docker daemon
              'nohup /usr/bin/dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --storage-driver=overlay2&',
              'timeout 15 sh -c "until docker info; do echo .; sleep 1; done"',

              // login to dockerhub so we won't get throttled
              'docker login -u ${DOCKERHUB_USERNAME} -p ${DOCKERHUB_PASSWORD}',

              // login to ecr so we can push to it
              `aws ecr get-login-password | docker login --username AWS --password-stdin ${ecrRegistry}`,

              ...commands,

            ],
          },
        },
      }),
    });

    // CodeBuild needs to read the secret to resolve environment variables
    props.dockerHubCreds.secret.grantRead(this._project);

    // this project needs push to all repos
    // TODO: Switch to using AuthToken.grantPull() - https://github.com/aws/aws-cdk/commit/c072981c175bf0509e9c606ff9ed441a0c7aef31
    // Awaiting next CDK release.
    this._grantAuthorize(this._project);
    this._repos.forEach((r, _) => r.grantPullPush(this._project));

    // this project needs to download the assets so it can build them
    assets.forEach(a => a.grantRead(this._project));

    if (props.autoStart) {
      new cr.AwsCustomResource(this, 'BuildExecution', {
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [this._project.projectArn] }),
        onUpdate: {
          action: 'startBuild',
          service: 'CodeBuild',
          parameters: {
            projectName: this._project.projectName,
            // to tigger the build on every update
            idempotencyToken: Date.now(),
          },
          physicalResourceId: cr.PhysicalResourceId.of('EcrRegistryExecution'),

          // need since the default reponse if greater than the 4k limit for custom resources.
          outputPath: 'build.id',
        },
      });
    }

    if (props.schedule) {
      new events.Rule(this, 'ScheduledTrigger', {
        schedule: props.schedule,
        targets: [new targets.CodeBuildProject(this._project)],
      });
    }

  }

  /**
   * Get the target ECR repository for the given repository name and tag.
   * @param repositoryName The ECR repository with this name
   * @param tag the tag for the repository, defaults to 'latest'
   */
  public ecrRepository(repositoryName: string, tag: string = 'latest'): ecr.IRepository | undefined {
    return this._repos.get(`${repositoryName}@${tag}`);
  }

  private _grantAuthorize(grantee: iam.IGrantable) {
    // see https://docs.aws.amazon.com/AmazonECR/latest/userguide/Registries.html#registry_auth
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
  }
};