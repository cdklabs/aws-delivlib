import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NpmValidation } from './validation';

function env(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (!defaultValue) {
    throw new Error(`${name} env variable is required`);
  }
  return defaultValue;
}

const GITHUB_TOKEN_SECRET_ARN = env('GITHUB_TOKEN_SECRET_ARN');
const GITHUB_REPOSITORY = env('GITHUB_REPOSITORY');

function gitClone() {

  console.log('Fetching GitHub token');
  const token = execSync(`aws secretsmanager get-secret-value --secret-id ${GITHUB_TOKEN_SECRET_ARN} --output=text --query=SecretString`, { encoding: 'utf-8' }).toString().trim();

  console.log(`Cloning ${GITHUB_REPOSITORY} repository`);
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo'));
  execSync(`git clone https://${token}@github.com/${GITHUB_REPOSITORY}.git ${repoDir}`);

  const latestTag = execSync('git describe --tags `git rev-list --tags --max-count=1`').toString();

  console.log(`Switching to latest tag: ${latestTag}`);
  execSync(`git checkout ${latestTag}`);

  return { repoDir, tag: latestTag };
}

const { repoDir, tag } = gitClone();

const manifestPath = path.join(repoDir, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf-8' }));

const isProjen = fs.existsSync(path.join(repoDir, '.projenrc.js'));
const isJsii = manifest.jsii !== undefined;

if (isProjen) {
  // projen projects don't have the version stored in package.json, so we add it before packing.
  manifest.version = tag.startsWith('v') ? tag.substring(1) : tag;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  execSync('yarn compile', { cwd: repoDir });
  execSync('yarn package', { cwd: repoDir });
} else {
  const packCommand = env('PACK_COMMAND');
  execSync(packCommand, { cwd: repoDir });
}

const outdir = isJsii ? `${manifest.jsii.outdir}/js` : repoDir;

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'work'));

const validation = new NpmValidation(manifest.name, manifest.version, outdir, workdir);
validation.validate();

// if (manifest.jsii) {
//   const outdir = manifest.jsii.outdir;
//   for (const [lang, target] of Object.entries(manifest.jsii.targets ?? {})) {
//     switch (lang) {
//       case 'python':
//         validations.push(new PyPIValidation(target.distName, manifest.version));
//         break;
//       default:
//         console.log('Vadli');
//     }
//   }
// }

// const errors = [];
// for (const validation of validations) {
//   try {
//     validation.validate();
//   } catch (e) {
//     errors.push(e);
//   }
// }

// if (errors.length !== 0) {
//   errors.forEach(e => console.log(`Validation error: ${e}`));
//   process.exit(1);
// }

// console.log('Done');
