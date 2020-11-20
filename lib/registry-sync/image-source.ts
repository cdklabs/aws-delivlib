import {
  Construct,
  aws_ecr as ecr,
  aws_s3_assets as s3Assets,
} from 'monocdk';

export interface RegistryImageSourceBindOptions {
  readonly ecrRegistry: string;
  readonly scope: Construct;
}

export interface RegistryImageSourceConfig {
  readonly commands: string[];
  readonly ecrImageUri: string;
  readonly repository: ecr.IRepository;
}

/**
 * Source of the image.
 */
export abstract class RegistryImageSource {

  /**
   * Configure an image from DockerHub.
   *
   * @param image e.g jsii/superchain
   */
  public static fromDockerHub(image: string): RegistryImageSource {
    class DockerHubImageSource extends RegistryImageSource {
      constructor() {
        const repository = image.split(':')[0];
        const tag = image.split(':')[1];

        // simulates DockerHub by perfixing library/ to official images
        const repositoryName = repository.includes('/') ? repository : `library/${repository}`;
        super(repositoryName, tag ?? 'latest', undefined);
      }

      public bind(options: RegistryImageSourceBindOptions) {
        const ecrImageUri = `${options.ecrRegistry}/${this.repositoryName}:${this.tag}`;
        return {
          commands: [
            `docker pull ${this.repositoryName}:${this.tag}`,
            `docker tag ${this.repositoryName}:${this.tag} ${ecrImageUri}`,
          ],
          ecrImageUri,
          repository: new ecr.Repository(options.scope, `Repo${this.repositoryName}`, {
            repositoryName: this.repositoryName,
          }),
        };
      }
    }

    return new DockerHubImageSource();
  }

  /**
   * Configure an image from a local directory.
   *
   * @param directory Path to directory containing the Dockerfile.
   * @param repository Repository name of the built image.
   * @param tag Tag of the built image.
   */
  public static fromDirectory(directory: string, repository: string, tag?: string): RegistryImageSource {
    class DirectoryImageSource extends RegistryImageSource {
      constructor() {
        super(repository, tag ?? 'latest', directory);
      }

      public bind(options: RegistryImageSourceBindOptions) {
        const asset = new s3Assets.Asset(options.scope, `BuildContext${this.directory}`, { path: this.directory! });
        const ecrImageUri = `${options.ecrRegistry}/${this.repositoryName}:${this.tag}`;
        return {
          commands: [
            `aws s3 cp ${asset.s3ObjectUrl} ${this.repositoryName}.zip`,
            `unzip ${this.repositoryName}.zip -d ${this.repositoryName}`,
            `docker build --pull -t ${ecrImageUri} ${this.repositoryName}`,
          ],
          ecrImageUri,
          repository: new ecr.Repository(options.scope, `Repo${this.repositoryName}`, {
            repositoryName: this.repositoryName,
          }),
        };
      }
    }
    return new DirectoryImageSource();
  }

  private constructor(private readonly repositoryName: string, private readonly tag: string, private readonly directory?: string) {
  }

  public abstract bind(options: RegistryImageSourceBindOptions): RegistryImageSourceConfig;
}
