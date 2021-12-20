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
    const isYarn = fs.existsSync(path.join(repoDir, 'yarn.lock'));

    if (!isProjen) {
      // this makes packing much simpler since projen standrardizes it.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only projen managed repositories are supported at this time');
    }

    if (!isYarn) {
      // the projen version we use has to match the one in the repo since otherwise
      // synthesis may result in a diff. so we use and enforce a yarn.lock file
      // to make it simpler and not have to worry about other package managers.
      // for now it will suffice, re-evaluate if a use-case arrises.
      throw new Error('Only yarn managed repositories are supported at this time');
    }

    this.isJsii = !!this.manifest.jsii;
  }

  /**
   * Pack the repository to produce the artifacts.
   */
  public pack(task?: string): Artifact[] {

    const installCommand = 'yarn install --frozen-lockfile';
    console.log(`Installing | ${installCommand}`);
    this._shell(installCommand);

    // note that run 'release' by default to preserve the version number.
    // this won't do a bump since the commit we are on is already tagged.
    const packCommand = `npx projen ${task ?? 'release'}`;
    console.log(`Packing | ${packCommand}`);
    this._shell(packCommand);

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

  private _shell(command: string) {
    execSync(command, { cwd: this.repoDir, stdio: ['ignore', 'inherit', 'inherit'] });
  }

}
