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
aws s3 sync . $BUCKET_URL $args