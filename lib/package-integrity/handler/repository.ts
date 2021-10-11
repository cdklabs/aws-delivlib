import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface PackOptions {

  /**
   * The command to run for packing the repository.
   *
   * @default - `yarn compile && yarn package` for projen repositries, `npm run build && npm pack` otherwise.
   */
  readonly command?: string;
}

export class Repository {

  private readonly isProjen: boolean;
  private readonly isJsii: boolean;
  private readonly manifestPath: string;
  private readonly manifest: any;
  private readonly latestTag: string;

  constructor(private readonly repoDir: string, private readonly tagPrefix?: string) {
    this.manifestPath = path.join(repoDir, 'package.json');
    this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, { encoding: 'utf-8' }));
    this.isProjen = fs.existsSync(path.join(repoDir, '.projenrc.js'));
    this.isJsii = !!this.manifest.jsii;
    this.latestTag = this.findLatestTag(repoDir, tagPrefix);

    console.log(`Switching to latest tag: ${this.latestTag}`);
    execSync(`git checkout ${this.latestTag}`, { cwd: repoDir });

    if (this.isProjen) {
      // projen projects don't have the version stored in package.json, so we add it before packing.
      const tagWithoutPrefix = this.latestTag.replace(this.tagPrefix ?? '', '');
      this.manifest.version = tagWithoutPrefix.startsWith('v') ? tagWithoutPrefix.substring(1) : tagWithoutPrefix;
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
    }

  }

  public pack(options: PackOptions = {}): { [key: string]: string } {

    execSync('yarn install --frozen-lockfile', { cwd: this.repoDir });

    const packCommand = options.command ?? (this.isProjen ? 'yarn compile && yarn package' : 'npm run build && npm pack');

    execSync(packCommand!, { cwd: this.repoDir });

    const outdir = this.isJsii ? path.join(this.repoDir, this.manifest.jsii.outdir) : path.join(this.repoDir, 'dist');

    const artifacts: { [key: string]: string } = {};
    for (const lang of fs.readdirSync(outdir)) {
      artifacts[lang] = path.join(outdir, lang);
    }

    return artifacts;

  }

  private findLatestTag(repoDir: string, prefix?: string) {
    const tags = execSync(`git tag -l --sort=-creatordate "${prefix ?? ''}*"`, { cwd: repoDir }).toString();
    return tags.split(os.EOL)[0].trim();
  }

}
