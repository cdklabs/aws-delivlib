import { createReadStream, existsSync, promises as fs } from 'fs';
import path from 'path';
import parseChangelog from 'changelog-parser';
import { Octokit } from 'octokit';

if (!process.env.GITHUB_TOKEN) { throw new Error('GITHUB_TOKEN is required'); }
if (!process.env.GITHUB_REPO) { throw new Error('GITHUB_REPO is required'); }
if (!process.env.GITHUB_OWNER) { throw new Error('GITHUB_OWNER is required'); }

const build_manifest = process.env.BUILD_MANIFEST || './build.json';
const changelog_file = process.env.CHANGELOG || './CHANGELOG.md';
const release_notes_file = process.env.RELEASE_NOTES || './RELEASE_NOTES.md';

const client = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

async function read_release_notes() {
  if (!existsSync(release_notes_file)) {
    return undefined;
  }
  return fs.readFile(release_notes_file, { encoding: 'utf8' });
}

async function read_changelog(version: string) {
  if (!existsSync(changelog_file)) {
    return undefined;
  }

  const changelog = await parseChangelog(changelog_file);

  const entry = (changelog.versions || []).find((item) => item.version === version);
  if (!entry) {
    throw new Error(`No changelog entry found for version ${version} in ${changelog_file}`);
  }

  return entry.body;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.resolve(process.cwd(), build_manifest), 'utf-8'));
  const tag_name = `v${manifest.version}`;
  const commit = manifest.commit || undefined;

  console.log(`Checking if release ${tag_name} already exists...`);
  let release = (await client.rest.repos.getReleaseByTag({
    owner, repo, tag: tag_name,
  }).catch((cause) => {
    if (cause.status === 404) {
      return Promise.resolve(undefined);
    } else {
      return Promise.reject(cause);
    }
  }))?.data;

  if (release != null) {
    console.warn(`️⚠️ Release '${tag_name}' already exists. Release notes will not be updated.`);
  } else {
    console.log('Reading release notes...');
    let release_notes = await read_release_notes();

    if (!release_notes) {
      console.log('No release notes found... Reading changelog...');
      release_notes = await read_changelog(manifest.version);
    }

    release = (await client.rest.repos.createRelease({
      owner,
      repo,
      tag_name,
      target_commitish: commit,
      body: release_notes,
    })).data;
  }

  console.log('Uploading assets...');
  for (const assetPath of process.argv.slice(2)) {
    const assetName = path.basename(assetPath);
    if (release.assets.some((asset) => asset.name === assetName)) {
      console.warn(`⚠️ Release '${tag_name}' already has an asset named '${assetName}'. Leaving it as-is.`);
      continue;
    }
    console.log(`Uploading asset '${assetName}' from ${assetPath}`);
    await client.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: release.id,
      name: assetName,
      // Note: Cheating here to send the data in streamng mode.
      //       When doing so, we need to specify the content-length header.
      // See: https://github.com/octokit/octokit.js/discussions/2087
      data: createReadStream(assetPath) as unknown as string,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': (await fs.stat(assetPath)).size,
      },
    });
  }

  console.log('✅ done');
}

main().catch(e => {
  console.error('❌', e);
  process.exit(1);
});
