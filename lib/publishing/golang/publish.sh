#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# Prepare the GitHub token
token="$(aws secretsmanager get-secret-value --secret-id ${GITHUB_TOKEN_SECRET} --output=text --query=SecretString)"
export GITHUB_TOKEN="${token}"

if [ ! -d "go" ]; then
  echo "Skipping go publishing. No 'go' directory in artifact."
  exit 0
fi

npx -p jsii-release jsii-release-golang go/

# NOTE: Not possible to detect whether the upload was skipped or not, so we'll
# compare against the previous version to see if we need to update the timestamp.
if [[ "${SSM_PREFIX:-}" != "" ]]; then
    build_manifest="${BUILD_MANIFEST:-"./build.json"}"
    version="$(node -p "require('${build_manifest}').version")"

    cur_version=$(aws ssm get-parameter --name "$SSM_PREFIX/version" --output text --query 'Parameter.Value' || echo '')

    if [[ "$cur_version" != "$version" ]]; then
      $dry_aws ssm put-parameter --name "$SSM_PREFIX/version" --type "String" --value "$version" --overwrite
      $dry_aws ssm put-parameter --name "$SSM_PREFIX/timestamp" --type "String" --value "$(date +%s)" --overwrite
    fi
fi