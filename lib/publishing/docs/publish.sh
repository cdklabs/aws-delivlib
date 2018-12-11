#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# Configure git to successfully push to the repository
aws secretsmanager get-secret-value --secret-id "${SSH_KEY_SECRET}" --output=text --query=SecretString > ~/.ssh/id_rsa
chmod 0600 ~/.ssh/id_rsa

git config --global user.name "${COMMIT_USERNAME}"
git config --global user.email "${COMMIT_EMAIL}"

# We need rsync for the publish script
echo "Installing rsync..."
apt-get update > /dev/null && apt-get install -y rsync

$SCRIPT_DIR/publish-docs.sh
