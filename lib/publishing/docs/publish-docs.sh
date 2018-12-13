#!/bin/bash
set -euo pipefail
artifacts=$PWD

###
# Usage: ./publish-docs.sh
#
# Publishes the documentation from the current directory to GitHub Pages
###

if [[ "${GITHUB_REPO:-}" == "" ]]; then
    echo "GITHUB_REPO variable not set." >&2
    exit 1
fi

if [[ "${FOR_REAL:-}" == "true" ]]; then
    dryrun=""
else
    echo "================================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo ""
    echo "Supply FOR_REAL=true as an environment variable to do actual publishing!" >&2
    echo "================================================="
    dryrun="--dry-run"
fi

branch="${GITHUB_PAGES_BRANCH:-gh-pages}"


###############
# PREPARATION #
###############

read_json_field() {
    node -e "process.stdout.write(require('./$1').$2)"
}

build_manifest="${BUILD_MANIFEST:-"./build.json"}"

if [ ! -f "${build_manifest}" ]; then
    echo "❌ ${build_manifest} file not found. should include 'name' and 'version' (did you set BUILD_MANIFEST?)"
    exit 1
fi

PKG_VERSION="$(read_json_field "${build_manifest}" version)"

echo "📖 Cloning branch ${branch} from ${GITHUB_REPO}"

WORKDIR=$(mktemp -d)

if ! git clone -b ${branch} --depth=1 ${GITHUB_REPO} ${WORKDIR}; then
    mkdir -p ${WORKDIR}
fi

cd ${WORKDIR}

# reset history on this branch by recreating the git repo
rm -fr .git
git init
git remote add origin ${GITHUB_REPO}
git checkout -b ${branch}

# create directory for old versions if doesn't exist yet
mkdir -p ./versions

# Check if we already have docs published for this version
if [ -d versions/${PKG_VERSION} ]; then
    echo "⚠️ Docs already published for version ${PKG_VERSION}. Skipping"
    exit 0
fi

echo "📖 Publishing new revision"
rsync -ar --delete --exclude=/.git --exclude=/versions ${artifacts}/docs/ ./
rsync -ar --delete ${artifacts}/docs/ ./versions/${PKG_VERSION}/

git add .
git commit --allow-empty -m "Release ${PKG_VERSION}"

# force push because we oblitirated the history on this branch
git push ${dryrun} --force origin ${branch}

echo "✅ All OK!"
