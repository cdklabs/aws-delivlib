import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { aws_codebuild as cbuild } from 'monocdk';


/**
 * Determines the "RunOrder" property for the next action to be added to a stage.
 * @param index Index of new action
 * @param concurrency The concurrency limit
 */
export function determineRunOrder(index: number, concurrency?: number): number | undefined {
  // no runOrder if we are at unlimited concurrency
  if (concurrency === undefined) {
    return undefined;
  }

  return Math.floor(index / concurrency) + 1;
}

/**
 * Hashes the contents of a file or directory. If the argument is a directory,
 * it is assumed not to contain symlinks that would result in a cyclic tree.
 *
 * @param fileOrDir the path to the file or directory that should be hashed.
 *
 * @returns a SHA256 hash, base-64 encoded.
 */
export function hashFileOrDirectory(fileOrDir: string): string {
  const hash = crypto.createHash('SHA256');
  hash.update(path.basename(fileOrDir)).update('\0');
  const stat = fs.statSync(fileOrDir);
  if (stat.isDirectory()) {
    for (const item of fs.readdirSync(fileOrDir).sort()) {
      hash.update(hashFileOrDirectory(path.join(fileOrDir, item)));
    }
  } else {
    hash.update(fs.readFileSync(fileOrDir));
  }
  return hash.digest('base64');
}

export function renderEnvironmentVariables(env?: { [key: string]: string }, type?: cbuild.BuildEnvironmentVariableType) {
  if (!env) {
    return undefined;
  }

  const out: { [key: string]: cbuild.BuildEnvironmentVariable } = { };
  for (const [key, value] of Object.entries(env)) {
    out[key] = { value, type };
  }
  return out;
}

export function noUndefined<T>(xs: Partial<T>): {[k in keyof T]: T[k]} {
  const ret: any = {};
  for (const [k, v] of Object.entries(xs)) {
    if (v !== undefined) {
      ret[k] = v;
    }
  }
  return ret;
}

export function mapValues<T, U>(xs: {[key: string]: T}, fn: (x: T) => U): {[key: string]: U} {
  const ret: {[key: string]: U} = {};
  for (const [k, v] of Object.entries(xs)) {
    ret[k] = fn(v);
  }
  return ret;
}
