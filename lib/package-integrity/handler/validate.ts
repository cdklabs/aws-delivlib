#!/usr/bin/env node
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NpmIntegrity, PyPIIntegrity } from './integrity';
import { Repository } from './repository';

function env(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (defaultValue == null) {
    throw new Error(`${name} env variable is required`);
  }
  return defaultValue;
}

const GITHUB_TOKEN_SECRET_ARN = env('GITHUB_TOKEN_SECRET_ARN');
const GITHUB_REPOSITORY = env('GITHUB_REPOSITORY');
const TAG_PREFIX = env('TAG_PREFIX', '');
const PACK_COMMAND = process.env.PACK_COMMAND;

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'work'));

function gitClone() {

  const token = execSync(`aws secretsmanager get-secret-value --secret-id ${GITHUB_TOKEN_SECRET_ARN} --output=text --query=SecretString`, { encoding: 'utf-8' }).toString().trim();

  const repoDir = fs.mkdtempSync(path.join(workdir, 'repo'));
  console.log(`Cloning ${GITHUB_REPOSITORY} into ${repoDir}`);
  execSync(`git clone https://${token}@github.com/${GITHUB_REPOSITORY}.git ${repoDir}`);

  return repoDir;
}

const repoDir = gitClone();
const repo = new Repository(repoDir, TAG_PREFIX);

const artifacts = repo.pack({ command: PACK_COMMAND });

for (const [lang, artifactDir] of Object.entries(artifacts)) {
  let integrity = undefined;
  switch (lang) {
    case 'js':
      integrity = new NpmIntegrity();
      break;
    case 'python':
      integrity = new PyPIIntegrity();
      break;
    default:
      break;
  }
  if (integrity) {
    integrity.validate(artifactDir);
  }
}
