import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Properties for `Repository`.
 */
export interface RepositoryProps {
  /**
   * Local directory where the repository was cloned to.
   */
  readonly repoDir: string;
}

/**
 * Artifact produced by this repository.
 */
export interface Artifact {
  /**
   * Language of the artifact.
   */
  readonly lang: string;

  /**
   * Directory containing the artifact.
   */
  readonly directory: string;
}

/**
 * Repository containing a node project.
 */
export class Repository {

  private readonly isJsii: boolean;
  private readonly projenVersion: string;
  private readonly manifest: any;

  constructor(private readonly repoDir: string, readonly version: string) {
    const manifestPath = path.join(repoDir, 'package.json');

    this.manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf-8' }));

    const isProjen = fs.existsSync(path.join(repoDir, '.projen'));

    if (!isProjen) {
      // this makes packing much simpler since projen standrardizes it.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only projen repositories are supported at this time');
    }

    this.projenVersion = this.manifest.devDependencies.projen;

    this.isJsii = !!this.manifest.jsii;

    // projen projects don't have the version stored in package.json, so we add it before packing.
    this.manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2));

  }

  /**
   * Pack the repository to produce the artifacts.
   */
  public pack(): Artifact[] {

    const packCommand = `npm install projen@${this.projenVersion} && npx projen build`;

    console.log(`Packing | ${packCommand}`);
    execSync(packCommand!, { cwd: this.repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

    const outdir = this.isJsii ? path.join(this.repoDir, this.manifest.jsii.outdir) : path.join(this.repoDir, 'dist');

    const artifacts: Artifact[] = [];
    for (const lang of fs.readdirSync(outdir)) {
      artifacts.push({ lang, directory: path.join(outdir, lang) });
    }

    return artifacts;

  }

}
