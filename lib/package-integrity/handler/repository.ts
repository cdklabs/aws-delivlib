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
  private readonly manifest: any;

  constructor(private readonly repoDir: string) {
    const manifestPath = path.join(repoDir, 'package.json');

    this.manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf-8' }));

    const isProjen = fs.existsSync(path.join(repoDir, '.projen'));

    if (!isProjen) {
      // this makes packing much simpler since projen standrardizes it.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only projen repositories are supported at this time');
    }

    this.isJsii = !!this.manifest.jsii;
  }

  /**
   * Pack the repository to produce the artifacts.
   */
  public pack(): Artifact[] {

    const installCommand = 'yarn install --frozen-lockfile';
    console.log(`Installing | ${installCommand}`);
    execSync(installCommand, { cwd: this.repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

    // note that we have to run 'release' to preserve the version number.
    // this won't do a bump since the commit we are on is already tagged.
    const packCommand = 'npx projen release';

    console.log(`Packing | ${packCommand}`);
    execSync(packCommand, { cwd: this.repoDir, stdio: ['ignore', 'inherit', 'inherit'] });

    const outdir = this.isJsii ? path.join(this.repoDir, this.manifest.jsii.outdir) : path.join(this.repoDir, 'dist');

    const artifacts: Artifact[] = [];
    for (const lang of fs.readdirSync(outdir)) {
      const langDir = path.join(outdir, lang);
      if (!fs.lstatSync(langDir).isDirectory()) {
        // dist folder may contain files such as changelog.md
        // so we ignore these
        continue;
      }
      artifacts.push({ lang, directory: path.join(outdir, lang) });
    }

    return artifacts;

  }

}