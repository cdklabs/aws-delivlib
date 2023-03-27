import {
  IAspect, Lazy, Stack, Token,
  aws_ecr as ecr,
  aws_codebuild as codebuild,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_s3_assets as s3Assets,
  aws_secretsmanager as sm,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
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
  readonly sources: MirrorSource[];

  /**
   * Credentials to signing into Dockerhub.
   */
  readonly dockerHubCredentials: DockerHubCredentials;

  /**
   * Sync job runs on a schedule.
   * Throws an error if neither this nor `autoStart` are specified.
   * @default - does not run on schedule
   */
  readonly schedule?: events.Schedule;

  /**
   * Start the sync job immediately after the deployment.
   * This injects a custom resource that is executed as part of the deployment.
   * Throws an error if neither this nor `schedule` are specified.
   * @default false
   */
  readonly autoStart?: boolean;
}

/**
 * Synchronize images from DockerHub to an ECR registry in the AWS account.
 * This is particularly useful to workaround DockerHub's throttling on pulls and use ECR instead.
 */
export class EcrMirror extends Construct {

  private readonly _repos: Map<string, ecr.Repository> = new Map();
  private readonly _repoTagsSeen = new Set<string>();
  private readonly _project: codebuild.Project;

  constructor(scope: Construct, id: string, props: EcrMirrorProps) {
    super(scope, id);

    if (!props.schedule && !props.autoStart) {
      throw new Error('Either schedule or autoStart must be provided');
    }

    const ecrRegistry = `${Stack.of(scope).account}.dkr.ecr.${Stack.of(scope).region}.amazonaws.com`;
    const commands: string[] = [];
    const assets = new Array<s3Assets.Asset>();

    const codeBuildSecretValue = (key: string, auth: DockerHubCredentials) => {
      return `${props.dockerHubCredentials.secret.secretName}:${key}:${auth.versionStage ?? 'AWSCURRENT'}`;
    };

    const username = codeBuildSecretValue(props.dockerHubCredentials.usernameKey, props.dockerHubCredentials);
    const password = codeBuildSecretValue(props.dockerHubCredentials.passwordKey, props.dockerHubCredentials);

    this._project = new codebuild.Project(this, 'EcrPushImages', {
      environment: {
        privileged: true,
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('public.ecr.aws/jsii/superchain:1-buster-slim', {
          secretsManagerCredentials: props.dockerHubCredentials.secret,
        }),
      },
      environmentVariables: {
        // DockerHub credentials to avoid throttling
        DOCKERHUB_USERNAME: { value: username, type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
        DOCKERHUB_PASSWORD: { value: password, type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
      },
      buildSpec: codebuild.BuildSpec.fromObject(Lazy.any({
        produce: () => {
          return {
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

                  // login to ecr-public so we can pull from it with improved rate limits
                  'aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws',

                  ...commands,
                ],
              },
            },
          };
        },
      })),
      ssmSessionPermissions: true,
    });

    // Ensure the runner has PULL access to ECR-Public.
    this._project.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticContainerRegistryPublicReadOnly'));

    for (const image of props.sources) {
      const result = image.bind({
        scope: this,
        ecrRegistry,
        syncJob: this._project,
      });
      commands.push(...result.commands);

      const repoTag = `${result.repositoryName}:${result.tag}`;
      if (this._repoTagsSeen.has(repoTag)) {
        throw new Error(`Mirror source with repository name [${result.repositoryName}] and tag [${result.tag}] already exists.`);
      }
      this._repoTagsSeen.add(repoTag);

      this.createMirrorRepo(result.repositoryName);

      const ecrImageUri = `${ecrRegistry}/${result.repositoryName}:${result.tag}`;
      commands.push(`docker push ${ecrImageUri}`);

      // clean after each push so that we don't fillup disk space
      // possibly failing the next pull.
      commands.push('docker image prune --all --force');
    }

    // CodeBuild needs to read the secret to resolve environment variables
    props.dockerHubCredentials.secret.grantRead(this._project);

    ecr.AuthorizationToken.grantRead(this._project);
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
            idempotencyToken: `${Date.now()}`,
          },
          physicalResourceId: cr.PhysicalResourceId.of('EcrRegistryExecution'),

          // need since the default reponse if greater than the 4k limit for custom resources.
          outputPaths: ['build.id'],
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

  private createMirrorRepo(repositoryName: string) {
    if (this._repos.get(repositoryName)) {
      return;
    }

    const repository = new ecr.Repository(this, `Repo${repositoryName}`, {
      repositoryName: repositoryName,
    });
    this._repos.set(repositoryName, repository);
  }

  /**
   * Get the target ECR repository for the given repository name and tag.
   * @param repositoryName The ECR repository with this name
   * @param tag the tag for the repository, defaults to 'latest'
   */
  public ecrRepository(repositoryName: string): ecr.IRepository | undefined {
    return this._repos.get(repositoryName);
  }
};

/**
 * An aspect that walks through the construct tree and replaces CodeBuild jobs with Docker images
 * with ECR equivalents found in the EcrMirror.
 */
export class EcrMirrorAspect implements IAspect {
  constructor(private readonly mirror: EcrMirror) {}

  public visit(construct: IConstruct) {
    if (construct instanceof codebuild.Project) {
      const cfnproject = construct.node.defaultChild as codebuild.CfnProject;
      if (!Token.isUnresolved(cfnproject.environment)) {
        const env = cfnproject.environment as codebuild.CfnProject.EnvironmentProperty;
        const imageName = env.image.split(':')[0];
        const tag = env.image.split(':')[1];
        const replacement = this.mirror.ecrRepository(imageName);
        if (replacement) {
          cfnproject.environment = {
            ...env,
            image: codebuild.LinuxBuildImage.fromEcrRepository(replacement, tag).imageId,
          };
          replacement.grantPull(construct);
          ecr.AuthorizationToken.grantRead(construct);
        }
      }
    }
  }
}
