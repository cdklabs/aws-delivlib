const path = require('path');
const github = require('octonode');
const { promisify } = require('util');
const fs = require('fs');
const parseChangelog = require('changelog-parser');
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);

if (!process.env.GITHUB_TOKEN) { throw new Error('GITHUB_TOKEN is required'); }
if (!process.env.GITHUB_REPO) { throw new Error('GITHUB_REPO is required'); }
if (!process.env.GITHUB_OWNER) { throw new Error('GITHUB_OWNER is required'); }

const build_manifest = process.env.BUILD_MANIFEST || './build.json';
const changelog_file = process.env.CHANGELOG || './CHANGELOG.md';

const client = github.client(process.env.GITHUB_TOKEN);

async function release_exists(repository, tag_name) {
    return new Promise((ok, fail) => {
        return client.repo(repository).releases((err, data) => {
            if (err) return fail(err);

            for (const release of data || []) {
                if (release.tag_name === tag_name) {
                    return ok(true);
                }
            }

            return ok(false);
        });
    });
}

async function read_changelog(version) {
    if (!await exists(changelog_file)) {
        return undefined;
    }

    console.log(fs.readFileSync(changelog_file))
    const changelog = await parseChangelog(changelog_file);

    const entry = (changelog.versions || []).find(entry => entry.version === version);
    if (!entry) {
        throw new Error(`No changelog entry found for version ${version} in ${changelog_file}`);
    }

    return entry.body;
}

async function create_release(repository, tag_name, commit, body) {
    return new Promise((ok, fail) => {
        const options = {
            tag_name,
            name: tag_name,
            target_commitish: commit,
            body
        };
        return client.repo(repository).release(options, (err, data) => {
            if (err) return fail(err);
            return ok(data.id);
        });
    });
}

async function upload_asset(ghrelease, file) {
    console.log(`uploading ${file}...`);
    const data = await readFile(file);
    return new Promise((ok, fail) => {
        const options = {
            name: path.basename(file)
        }
        return ghrelease.uploadAssets(data, options, (err, data) => {
            if (err) return fail(err);
            return ok();
        });
    });
}

async function upload_assets(repository, release_id, files) {
    if (files.length === 0) {
        console.warn('⚠️ warning: no files to upload')
        return;
    }

    const ghrelease = client.release(repository, release_id)

    for (const file of files) {
        await upload_asset(ghrelease, file);
    }
}

async function main() {
    const manifest = require(path.join(process.cwd(), build_manifest));
    const repository = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;
    const tag_name = `v${manifest.version}`;
    const commit = manifest.commit || undefined;

    console.log(`checking if release ${tag_name} already exists...`);
    const exists = await release_exists(repository, tag_name);
    if (exists) {
        console.warn(`️⚠️  release '${tag_name}' already exists. skipping`);
        return;
    }

    console.log('reading changelog...');
    const changelog = await read_changelog(manifest.version);

    console.log('creating release...');
    const release_id = await create_release(repository, tag_name, commit, changelog);

    console.log('uploading assets...');
    await upload_assets(repository, release_id, process.argv.slice(2));

    console.log('✅ done');
}

main().catch(e => {
    console.error('❌', e);
    process.exit(1);
});