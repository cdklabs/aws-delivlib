import {
  Construct,
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
   */
  public static fromDockerHub(image: string): MirrorSource {
    class DockerHubMirrorSource extends MirrorSource {
      constructor() {
        const repository = image.split(':')[0];
        const tag = image.split(':')[1];

        // simulates DockerHub by perfixing library/ to official images
        const repositoryName = repository.includes('/') ? repository : `library/${repository}`;
        super(repositoryName, tag ?? 'latest', undefined);
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
   * @param repository Repository name of the built image.
   * @param tag Tag of the built image.
   */
  public static fromDirectory(directory: string, repository: string, tag?: string): MirrorSource {
    class DirectoryMirrorSource extends MirrorSource {
      constructor() {
        super(repository, tag ?? 'latest', directory);
      }

      public bind(options: MirrorSourceBindOptions) {
        const asset = new s3Assets.Asset(options.scope, `BuildContext${this.directory}`, { path: this.directory! });
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

  private constructor(private readonly repositoryName: string, private readonly tag: string, private readonly directory?: string) {
  }

  public abstract bind(options: MirrorSourceBindOptions): MirrorSourceConfig;
}
