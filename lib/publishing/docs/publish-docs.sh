#!/bin/bash
set -euo pipefail

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

###############
# PREPARATION #
###############

declare -a CLEANUP=()
function cleanup() {
    for ((i = 0; i < ${#CLEANUP[@]}; i++ ))
    do
        eval "${CLEANUP[$i]}"
    done
    echo '🍻 Done!'
}
trap cleanup 'EXIT'

read_json_field() {
    node -e "process.stdout.write(require('./$1').$2)"
}

build_manifest="${BUILD_MANIFEST:-"./build.json"}"

if [ ! -f "${build_manifest}" ]; then
    echo "❌ ${build_manifest} file not found. should include 'name' and 'version' (did you set BUILD_MANIFEST?)"
    exit 1
fi

PKG_VERSION="$(read_json_field "${build_manifest}" version)"

################
# GitHub Pages #
################

echo "📖 Cloning current GitHub Pages"

GIT_REPO=$(mktemp -d)
CLEANUP+=("echo '🚮 Cleaning up GitHub Pages working copy'" "rm -fr ${GIT_REPO}")

git clone -b gh-pages --depth=1 ${GITHUB_REPO} ${GIT_REPO}
mkdir -p ${GIT_REPO}/versions

# Check if we already have docs published for this version
if [ -d ${GIT_REPO}/versions/${PKG_VERSION} ]; then
    echo "⚠️ Docs already published for version ${PKG_VERSION}. Skipping"
    exit 0
fi

echo "📖 Publishing new revision"

rsync -ar --delete --exclude=/.git --exclude=/versions --exclude=/.nojekyll ./docs/ ${GIT_REPO}/
rsync -ar --delete ./docs/ ${GIT_REPO}/versions/${PKG_VERSION}/

(
    cd ${GIT_REPO}
    git add .
    git commit --allow-empty -m "Release ${PKG_VERSION}"
    git push ${dryrun}
)

echo "✅ All OK!"
