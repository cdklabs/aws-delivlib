#!/bin/bash
set -euo pipefail
scriptdir="$(cd $(dirname $0) && pwd)"

heading() {
    echo
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
    echo "$@"
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
}

read_json_field() {
    node -e "process.stdout.write(require('./$1').$2)"
}

build_manifest="${BUILD_MANIFEST:-"./build.json"}"

if [ ! -f "${build_manifest}" ]; then
    echo "${build_manifest} file not found. should include the fields: 'name', 'version' and 'commit' (did you set BUILD_MANIFEST?)"
    exit 1
fi

version="$(read_json_field "${build_manifest}" version)"
name="$(read_json_field "${build_manifest}" name)"

# install npm deps
(cd ${scriptdir} && npm i)

# --------------------------------------------------------------------------------------------------
heading "Build metadata"
echo "name: ${name}"
echo "version: ${version}"

# --------------------------------------------------------------------------------------------------
heading "Preparing .zip archive"
workdir="$(mktemp -d)"
archive="${workdir}/${name}-${version}.zip"
zip -y -r ${archive} .

# --------------------------------------------------------------------------------------------------
heading "Signing .zip archive"
chmod +x ${scriptdir}/with-signing-key.sh
chmod +x ${scriptdir}/sign-files.sh
${scriptdir}/with-signing-key.sh ${scriptdir}/sign-files.sh ${archive}

# --------------------------------------------------------------------------------------------------
heading "Creating release"
node ${scriptdir}/create-release.js ${workdir}/*
