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
    aws s3 cp $BUCKET_URL/$idempotency_token - > /dev/null 2>&1 && {
        echo "Token found, stopping."
        exit 0
    } || {
        echo "Idempotency token not found, continuing."
    }
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
else
    echo "==========================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo
    echo "Skipping the actual publishing step."
    echo
    echo "Set FOR_REAL=true to do it!"
    echo "==========================================="
fi