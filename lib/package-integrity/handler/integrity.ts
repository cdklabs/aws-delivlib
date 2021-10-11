import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Published package.
 */
interface Package {

  /**
   * Name of the package as stored in the package manager.
   */
  readonly name: string;

  /**
   * Version of the package as stored in the package manager.
   */
  readonly version: string;
}

/**
 * Integrity class for validating local artifacts against their published counterpart.
 */
export abstract class Integrity {

  /**
   * Download a package to the target directory.
   *
   * This functionality differs based on the package manager.
   *
   * @param pkg The package to download.
   * @param target The directory to download to.
   */
  protected abstract download(pkg: Package, target: string): void;

  /**
   * Extract the artifact into the target directory.
   *
   * This functionality differs based on the package manager.
   *
   * @param artifact Path to an artifact file.
   * @param target The directory to extract do.
   */
  protected abstract extract(artifact: string, target: string): void;

  /**
   * Parse a local artifact file name into a structured package.
   *
   * @param artifactName Base name of the local artifact file.
   * @returns The package this artifact correlates to.
   */
  protected abstract parse(artifactName: string): Package;

  /**
   * The file extenstion of artifacts produced for this check. (e.g whl)
   */
  protected abstract get ext(): string;

  /**
   * Validate a local artifact against its published counterpart.
   *
   * @param artifactDir The directory of the local artifact. Must contain exactly one file with the appropriate extenstion.
   */
  public validate(artifactDir: string) {

    const artifactPath = this.findOne(artifactDir);
    const name = this.constructor.name;

    console.log(`Running ${name} on ${artifactPath}`);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-check'));

    try {
      const downloaded = path.join(workdir, `${name}.downloaded`);
      const published = path.join(workdir, `${name}.published`);
      const local = path.join(workdir, `${name}.local`);

      fs.mkdirSync(downloaded);
      fs.mkdirSync(published);
      fs.mkdirSync(local);

      // parse the artifact name into a package.
      const pkg = this.parse(path.basename(artifactPath));

      // download the package
      this.download(pkg, downloaded);

      // extract the downlaoded package
      this.extract(this.findOne(downloaded), published);

      // extract the local artfiact
      this.extract(artifactPath, local);

      console.log(`Validating diff between ${local} and ${published}`);
      execSync(`diff ${local} ${published}`);

    } finally {
      execSync(`rm -rf ${workdir}`);
    }

  }

  private findOne(dir: string): string {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(this.ext));
    if (files.length === 0) {
      throw new Error(`No files found in ${dir}`);
    }
    if (files.length > 1) {
      throw new Error(`Multiple files found in ${dir}`);
    }
    return path.join(dir, files[0]);
  }

}

/**
 * NpmIntegiry is able to perform integiry checks against packages stored on npmjs.com
 */
export class NpmIntegrity extends Integrity {

  protected get ext(): string {
    return 'tgz';
  }

  protected download(pkg: Package, target: string): void {
    execSync(`npm pack ${pkg.name}@${pkg.version}`, { cwd: target });
  }

  protected extract(file: string, target: string): void {
    execSync(`tar -zxvf ${file} --strip-components=1 -C ${target}`);
  }

  protected parse(artifactName: string): Package {

    // cdk8s@1.0.0-beta.59.jsii.tgz
    const jsiiArtifact = /(.*)@(.*)\.jsii./;

    // npm artifact: cdk8s-cli-1.0.0-beta59.tgz
    // yarn artifact: cdk8s-cli-v1.0.0-beta59.tgz (add a 'v' before the version)
    const npmOrYarnArtifact = /(.*)-v?(\d.*).(tgz|tar.gz)/;

    const regex = artifactName.includes('.jsii.') ? jsiiArtifact : npmOrYarnArtifact;

    const match = artifactName.match(regex);
    if (!match) {
      throw new Error(`Unable to parse artifact: ${artifactName}`);
    }

    return { name: match[1], version: match[2] };

  }

}

/**
 * PyPIIntegiry is able to perform integiry checks against packages stored on pypi.org
 */
export class PyPIIntegrity extends Integrity {

  protected get ext(): string {
    return 'whl';
  }

  protected download(pkg: Package, target: string): void {
    execSync(`pip download --no-deps ${pkg.name}==${pkg.version}`, { cwd: target });
  }

  protected extract(artifact: string, target: string): void {
    execSync(`unzip ${artifact}`, { cwd: target });
  }

  protected parse(artifactName: string): Package {

    // cdk8s-1.0.0b63-py3-none-any.whl
    const regex = /(.*)-v?(\d.*)-py.*.whl/;

    const match = artifactName.match(regex);
    if (!match) {
      throw new Error(`Unable to parse artifact: ${artifactName}`);
    }

    return { name: match[1], version: match[2] };

  }

}