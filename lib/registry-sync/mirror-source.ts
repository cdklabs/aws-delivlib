import {
  aws_codebuild as codebuild,
  aws_s3_assets as s3Assets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface MirrorSourceBindOptions {
  /**
   * The target ECR registry
   */
  readonly ecrRegistry: string;
  /**
   * The scope to attach any constructs that may also be needed.
   */
  readonly scope: Construct;

  /**
   * The CodeBuild project that will run the synchronization between DockerHub and ECR.
   * @default - either no sync job is present or it's not defined yet.
   */
  readonly syncJob?: codebuild.IProject;
}

export interface MirrorSourceConfig {
  /**
   * The commands to run to retrieve the docker image.
   * e.g. ['docker pull <image-id>']
   */
  readonly commands: string[];

  /**
   * The name of the target ECR repository.
   */
  readonly repositoryName: string;

  /**
   * The tag to be use for the target ECR image.
   */
  readonly tag: string;
}

/** Additional options when configuring a Mirror Source from a local directory */
export interface MirrorSourceDirectoryOptions {
  /**
   * Tag of the built image.
   * @default 'latest'
   */
  readonly tag?: string;

  /**
   * Build args to pass to the `docker build` command.
   *
   * @default - no build args are passed
   */
  readonly buildArgs?: { [key: string]: string };
}

/**
 * Source of the image.
 */
export abstract class MirrorSource {

  /**
   * Configure an image from DockerHub.
   *
   * @param image e.g jsii/superchain
   * @param tag optional, defaults to 'latest'
   *
   * @deprecated This method's name inaccurately expresses that the image comes
   * from DockerHub, when any publicly-accessible repository can be used. Prefer
   * using `fromImageName(string, string?)` instead, which is more aptly named.
   */
  public static fromDockerHub(image: string, tag: string = 'latest'): MirrorSource {
    return this.fromPublicImage(image, tag);
  }

  /**
   * Configure an image from DockerHub or a repository-qualified image name.
   *
   * @param image e.g public.ecr.aws/jsii/superchain
   * @param tag optional, defaults to 'latest'
   * @param ecrRepositoryName the name of the ECR Repository to use (e.g: jsii/superchain)
   */
  public static fromPublicImage(image: string, tag: string = 'latest', ecrRepositoryName: string = image.includes('/') ? image : `library/${image}`): MirrorSource {
    class DockerHubMirrorSource extends MirrorSource {
      constructor() {
        if (image.includes(':')) {
          throw new Error('image must not include tag');
        }
        // simulates DockerHub by prefixing library/ to official images
        const repositoryName = image.includes('/') ? image : `library/${image}`;
        super(repositoryName, tag, undefined, ecrRepositoryName);
      }

      public bind(options: MirrorSourceBindOptions): MirrorSourceConfig {
        const ecrImageUri = `${options.ecrRegistry}/${this.ecrRepositoryName}:${this.tag}`;
        return {
          commands: [
            `docker pull ${this.repositoryName}:${this.tag}`,
            `docker tag ${this.repositoryName}:${this.tag} ${ecrImageUri}`,
          ],
          repositoryName: this.ecrRepositoryName,
          tag: this.tag,
        };
      }
    }

    return new DockerHubMirrorSource();
  }

  /**
   * DEPRECATED
   * @deprecated use fromDir()
   */
  public static fromDirectory(directory: string, repositoryName: string, tag?: string): MirrorSource {
    return this.fromDir(directory, repositoryName, { tag });
  }

  /**
   * Configure an image from a local directory.
   *
   * @param directory Path to directory containing the Dockerfile.
   * @param repositoryName Repository name of the built image.
   * @param options additional configuration options
   */
  public static fromDir(directory: string, repositoryName: string, opts: MirrorSourceDirectoryOptions = {}): MirrorSource {
    class DirectoryMirrorSource extends MirrorSource {
      constructor() {
        super(repositoryName, opts.tag ?? 'latest', directory);
      }

      public bind(options: MirrorSourceBindOptions): MirrorSourceConfig {
        const asset = new s3Assets.Asset(options.scope, `BuildContext${this.directory}${JSON.stringify(opts.buildArgs ?? {})}`, { path: this.directory! });
        if (options.syncJob) {
          asset.grantRead(options.syncJob);
        }
        const ecrImageUri = `${options.ecrRegistry}/${this.ecrRepositoryName}:${this.tag}`;
        const cmdFlags = [];
        cmdFlags.push('--pull');
        cmdFlags.push('-t', ecrImageUri);

        if (opts.buildArgs) {
          Object.entries(opts.buildArgs).forEach(([k, v]) => cmdFlags.push('--build-arg', `${k}=${v}`));
        }

        const zipFile = `${this.repositoryName}.zip`;
        const tmpDir = this.repositoryName;

        return {
          commands: [
            `rm -rf ${zipFile} ${tmpDir}`,
            `aws s3 cp ${asset.s3ObjectUrl} ${zipFile}`,
            `unzip ${zipFile} -d ${tmpDir}`,
            `docker build ${cmdFlags.join(' ')} ${tmpDir}`,
          ],
          repositoryName: this.ecrRepositoryName,
          tag: this.tag,
        };
      }
    }
    return new DirectoryMirrorSource();
  }

  private constructor(
    protected readonly repositoryName: string,
    protected readonly tag: string,
    protected readonly directory?: string,
    protected readonly ecrRepositoryName = repositoryName,
  ) {
  }

  /**
   * Bind the source with the EcrMirror construct.
   */
  public abstract bind(options: MirrorSourceBindOptions): MirrorSourceConfig;
}
