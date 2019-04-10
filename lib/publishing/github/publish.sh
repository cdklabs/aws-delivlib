#!/bin/bash
set -euo pipefail
scriptdir="$(cd $(dirname $0) && pwd)"
workdir="$(mktemp -d)"

heading() {
    echo
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
    echo "$@"
    echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
}

read_json_field() {
    node -e "process.stdout.write(require('./$1').$2)"
}

# prepare_artifacts_in_current_dir TRY_TO_SIGN
prepare_artifacts_in_current_dir() {
    echo "dir:" $(pwd)
    local build_manifest="${BUILD_MANIFEST:-"./build.json"}"

    if [ ! -f "${build_manifest}" ]; then
        echo "${build_manifest} file not found. should include the fields: 'name', 'version' and 'commit' (did you set BUILD_MANIFEST?)" >&2
        exit 1
    fi

    local version="$(read_json_field "${build_manifest}" version)"
    local name="$(read_json_field "${build_manifest}" name)"

    # --------------------------------------------------------------------------------------------------
    echo "name: ${name}"
    echo "version: ${version}"

    # --------------------------------------------------------------------------------------------------
    echo "Preparing .zip archive"
    local archive="${workdir}/${name}-${version}.zip"

    [[ ! -f ${archive} ]] || {
        echo "File already created by a different artifact: $archive" >&2
        echo "(Did you remember to create a different ${build_manifest} for every artifact?)" >&2
        exit 1
    }
    zip -y -r ${archive} .

    # --------------------------------------------------------------------------------------------------
    if $1; then
        echo "Signing .zip archive"
        chmod +x ${scriptdir}/with-signing-key.sh
        chmod +x ${scriptdir}/sign-files.sh
        ${scriptdir}/with-signing-key.sh ${scriptdir}/sign-files.sh ${archive}
    fi
}

# --------------------------------------------------------------------------------------------------

heading "Primary Source"
prepare_artifacts_in_current_dir true

if [[ "${SECONDARY_SOURCE_NAMES:-}" != "" ]]; then
    for source_name in ${SECONDARY_SOURCE_NAMES}; do
        heading "Additional Source: $source_name"
        (cd ${CODEBUILD_SRC_DIR_${source_name}} && prepare_artifacts_in_current_dir ${SIGN_ADDITIONAL_ARTIFACTS:-false})
    done
fi


# --------------------------------------------------------------------------------------------------
# install npm deps
(cd ${scriptdir} && npm i)

heading "Creating release"
ls ${workdir}

if $FOR_REAL; then
    node ${scriptdir}/create-release.js ${workdir}/*
else
    echo "==========================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo
    echo "Skipping the actual publishing step."
    echo
    echo "Set FOR_REAL=true to do it!"
    echo "==========================================="
fi
