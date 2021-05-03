import {
  Construct,
  aws_codebuild as codebuild,
  aws_s3_assets as s3Assets,
} from 'monocdk';

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

/**
 * Source of the image.
 */
export abstract class MirrorSource {

  /**
   * Configure an image from DockerHub.
   *
   * @param image e.g jsii/superchain
   * @param tag optional, defaults to 'latest'
   */
  public static fromDockerHub(image: string, tag: string = 'latest'): MirrorSource {
    class DockerHubMirrorSource extends MirrorSource {
      constructor() {
        if (image.includes(':')) {
          throw new Error('image must not include tag');
        }
        // simulates DockerHub by perfixing library/ to official images
        const repositoryName = image.includes('/') ? image : `library/${image}`;
        super(repositoryName, tag, undefined);
      }

      public bind(options: MirrorSourceBindOptions) {
        const ecrImageUri = `${options.ecrRegistry}/${this.repositoryName}:${this.tag}`;
        return {
          commands: [
            `docker pull ${this.repositoryName}:${this.tag}`,
            `docker tag ${this.repositoryName}:${this.tag} ${ecrImageUri}`,
          ],
          repositoryName: this.repositoryName,
          tag: this.tag,
        };
      }
    }

    return new DockerHubMirrorSource();
  }

  /**
   * Configure an image from a local directory.
   *
   * @param directory Path to directory containing the Dockerfile.
   * @param repositoryName Repository name of the built image.
   * @param tag Tag of the built image.
   */
  public static fromDirectory(directory: string, repositoryName: string, tag?: string): MirrorSource {
    class DirectoryMirrorSource extends MirrorSource {
      constructor() {
        super(repositoryName, tag ?? 'latest', directory);
      }

      public bind(options: MirrorSourceBindOptions) {
        const asset = new s3Assets.Asset(options.scope, `BuildContext${this.directory}`, { path: this.directory! });
        if (options.syncJob) {
          asset.grantRead(options.syncJob);
        }
        const ecrImageUri = `${options.ecrRegistry}/${this.repositoryName}:${this.tag}`;
        return {
          commands: [
            `aws s3 cp ${asset.s3ObjectUrl} ${this.repositoryName}.zip`,
            `unzip ${this.repositoryName}.zip -d ${this.repositoryName}`,
            `docker build --pull -t ${ecrImageUri} ${this.repositoryName}`,
          ],
          repositoryName: this.repositoryName,
          tag: this.tag,
        };
      }
    }
    return new DirectoryMirrorSource();
  }

  private constructor(protected readonly repositoryName: string, protected readonly tag: string, protected readonly directory?: string) {
  }

  /**
   * Bind the source with the EcrMirror construct.
   */
  public abstract bind(options: MirrorSourceBindOptions): MirrorSourceConfig;
}
