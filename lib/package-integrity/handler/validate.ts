#!/usr/bin/env node
import { RepositoryIntegrity } from './integrity';
import { Repository } from './repository';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} env variable is required`);
}

function optionalEnv(name: string, defaultValue?: string) {
  return process.env[name] ?? defaultValue;
}

const GITHUB_TOKEN_ARN = requiredEnv('GITHUB_TOKEN_ARN');
const GITHUB_REPOSITORY = requiredEnv('GITHUB_REPOSITORY');
const TAG_PREFIX = optionalEnv('TAG_PREFIX');
const PACK_TASK = optionalEnv('PACK_TASK');

async function main() {

  const repo = await Repository.fromGitHub({
    githubTokenSecretArn: GITHUB_TOKEN_ARN,
    slug: GITHUB_REPOSITORY,
    tagPrefix: TAG_PREFIX,
  });

  const integrity = new RepositoryIntegrity({
    repository: repo,
    packTask: PACK_TASK,
  });

  await integrity.validate();

}

main()
  .catch(e => {
    console.log(`Error: ${e.message}`);
    process.exitCode = 1;
  });
