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

# Configure git to successfully push to the repository
git config --global user.name "${COMMIT_USERNAME}"
git config --global user.email "${COMMIT_EMAIL}"

# We need rsync for the publish script
echo "Installing rsync..."
apt-get update > /dev/null && apt-get install -y rsync

/bin/bash $SCRIPT_DIR/publish-docs.sh
