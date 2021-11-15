#!/usr/bin/env node
import { RepositoryIntegrity } from './integrity';

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

const integrity = new RepositoryIntegrity({
  githubTokenSecretArn: GITHUB_TOKEN_ARN,
  repository: GITHUB_REPOSITORY,
  tagPrefix: TAG_PREFIX,
});
try {
  integrity.validate();
} catch (e) {
  console.log(e);
}