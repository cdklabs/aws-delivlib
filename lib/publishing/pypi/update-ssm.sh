#!/bin/bash
# Write the current version and timestamp to SSM, if the current version is new
set -eu

if [[ "${SSM_PREFIX:-}" != "" ]]; then
  if [[ "${FOR_REAL:-}" == "true" ]]; then
    dry_aws="aws"
  else
    dry_aws="echo aws"
  fi

  build_manifest="${BUILD_MANIFEST:-"./build.json"}"
  version="$(node -p "require('${build_manifest}').version")"

  cur_version=$(aws ssm get-parameter --name "$SSM_PREFIX/version" --output text --query 'Parameter.Value' || echo '-missing-')

  if [[ "$cur_version" != "$version" ]]; then
    echo "📖 Writing version and timestamp to $SSM_PREFIX/{version,timestamp}"
    $dry_aws ssm put-parameter --name "$SSM_PREFIX/version" --type "String" --value "$version" --overwrite
    $dry_aws ssm put-parameter --name "$SSM_PREFIX/timestamp" --type "String" --value "$(date +%s)" --overwrite
  else
    echo "⚠️ Version already up-to-date."
  fi
fi
