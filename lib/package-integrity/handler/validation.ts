import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export abstract class Validation {

  constructor(protected readonly name: string,
    protected readonly version: string,
    protected readonly artifactDir: string,
    protected readonly workdir: string) {}

  public abstract extractPublishedArtifact(): string;

  public abstract extractLocalArtifact(): string;

  public validate() {

    const local = this.extractLocalArtifact();
    const published = this.extractPublishedArtifact();
    execSync(`diff ${local} ${published}`);

  }
}

export class NpmValidation extends Validation {

  public extractPublishedArtifact(): string {
    const dir = path.join(this.workdir, 'npm');
    fs.mkdirSync(dir);
    execSync(`npm pack ${this.name}@${this.version}`, { cwd: dir });
    execSync('tar -zxvf *', { cwd: dir, shell: '/bin/bash' });
    return path.join(dir, 'package');
  }

  public extractLocalArtifact(): string {
    const dir = path.join(this.workdir, 'local');
    fs.mkdirSync(dir);
    execSync(`cp ${this.artifactDir}/* ${dir}`, { shell: '/bin/bash' });
    execSync('tar -zxvf *', { cwd: dir, shell: '/bin/bash' });
    return path.join(dir, 'package');
  }


}