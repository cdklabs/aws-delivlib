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
import { RegistryImageSource } from './image-source';

/**
 * Authentication details for logging in to DockerHub.
 *
 * @see https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec.env.secrets-manager
 */
export interface DockerHubCredentials {

  /**
   * The secret arn the values are stored in.
   */
  readonly secretArn: string;

  /**
   * Key to retrieve the username from.
   */
  readonly usernameKey: string;

  /**
   * Key to retrieve the password from.
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
export interface EcrRegistrySyncProps {
  /**
   * The list of images to keep sync'ed.
   */
  readonly images: RegistryImageSource[];

  /**
   * Credentials to signing into Dockerhub.
   */
  readonly dockerhubCreds: DockerHubCredentials;

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
 * Synchronize images from DockerHub to a specified ECR registry.
 * This is particularly useful to workaround DockerHub's throttling on pulls and use ECR instead.
 */
export class EcrRegistrySync extends Construct {

  private readonly _repos: ecr.IRepository[] = [];
  private readonly _project: codebuild.Project;

  constructor(scope: Construct, id: string, props: EcrRegistrySyncProps) {
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
      this._repos.push(new ecr.Repository(this, `Repo${result.repositoryName}`, {
        repositoryName: result.repositoryName,
      }));

      const ecrImageUri = `${ecrRegistry}/${result.repositoryName}:${result.tag}`;
      commands.push(`docker push ${ecrImageUri}`);

      // clean after each push so that we don't fillup disk space
      // possibly failing the next pull.
      commands.push('docker image prune --all --force');
    }

    const dockerHubSecret = sm.Secret.fromSecretArn(this, 'DockerHubSecret', props.dockerhubCreds.secretArn);

    const codeBuildSecretValue = (key: string, auth: DockerHubCredentials) => {
      return `${dockerHubSecret.secretName}:${key}:${auth.versionStage ?? 'AWSCURRENT'}`;
    };

    const username = codeBuildSecretValue(props.dockerhubCreds.usernameKey, props.dockerhubCreds);
    const password = codeBuildSecretValue(props.dockerhubCreds.passwordKey, props.dockerhubCreds);

    this._project = new codebuild.Project(this, 'EcrPushImages', {
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('jsii/superchain', {
          secretsManagerCredentials: dockerHubSecret,
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
    dockerHubSecret.grantRead(this._project);

    // this project needs push to all repos
    this._grantAuthorize(this._project);
    this._repos.forEach(r => r.grantPullPush(this._project));

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
   * Grant the specified grantees pull privileges to the target ECR repositories.
   */
  public grantPull(...grantees: iam.IGrantable[]) {
    for (const grantee of grantees) {
      this._grantAuthorize(grantee);
      this._repos.forEach(p => p.grantPull(grantee));
    }
  }

  private _grantAuthorize(grantee: iam.IGrantable) {
    // see https://docs.aws.amazon.com/AmazonECR/latest/userguide/Registries.html#registry_auth
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
  }
};