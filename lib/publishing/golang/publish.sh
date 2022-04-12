#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# Prepare the GitHub token
token="$(aws secretsmanager get-secret-value --secret-id ${GITHUB_TOKEN_SECRET} --output=text --query=SecretString)"

if [[ ! -z "${GITHUB_TOKEN_SECRET_KEY}" ]]; then
  token=$(node -e "console.log(${token}.${GITHUB_TOKEN_SECRET_KEY});")
fi

export GITHUB_TOKEN="${token}"

if [ ! -d "go" ]; then
  echo "Skipping go publishing. No 'go' directory in artifact."
  exit 0
fi

exec npx -p jsii-release jsii-release-golang go/