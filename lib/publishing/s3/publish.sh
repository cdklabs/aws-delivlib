#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# Sync to S3 publicly readable
args=""
if ${PUBLIC:-false}; then
  args="--acl public-read"
fi

idempotency_token=""

# See if there's a file with publishing commands
if [[ -f s3-publishing.json ]]; then
    echo "Found publishing instructions"
    cat s3-publishing.json

    idempotency_token=$(node -pe "require('./s3-publishing.json')['idempotency-token'] || ''")

    # We don't want to upload this file
    args="$args --exclude s3-publishing.json"
fi

if [[ "${idempotency_token:-}" != "" ]]; then
    echo "Idempotency token: $idempotency_token"

    # Must use 's3 cp' to try and read exact filename. 's3 ls' would match prefixes as well.
    if aws s3 cp $BUCKET_URL/$idempotency_token - > /dev/null 2>&1; then
        echo "Token found, stopping."
        exit 0
    else
        echo "Idempotency token not found, continuing."
    fi
fi

# Do the copy
echo "Starting the upload to $BUCKET_URL"
echo "(Args: $args)"

if $FOR_REAL; then
    aws s3 cp --recursive . $BUCKET_URL $args

    if [[ "${idempotency_token:-}" != "" ]]; then
        echo "Writing idempotency token..."
        echo 1 | aws s3 cp - $BUCKET_URL/$idempotency_token
    fi

    dry_aws=aws
else
    echo "==========================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo
    echo "Skipping the actual publishing step."
    echo
    echo "Set FOR_REAL=true to do it!"
    echo "==========================================="
    dry_aws="echo aws"
fi

# If we saw an idempotency token we wouldn't have gotten here
if [[ "${SSM_PREFIX:-}" != "" ]]; then
    build_manifest="${BUILD_MANIFEST:-"./build.json"}"
    version="$(node -p "require('${build_manifest}').version")"

    $dry_aws ssm put-parameter --name "$SSM_PREFIX/version" --type "String" --value "$version" --overwrite
    $dry_aws aws ssm put-parameter --name "$SSM_PREFIX/timestamp" --type "String" --value "$(date +%s)" --overwrite
fi