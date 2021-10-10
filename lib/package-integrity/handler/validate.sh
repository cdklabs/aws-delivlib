#!/bin/bash

set -euo pipefail

GITHUB_TOKEN_SECRET_ARN="${GITHUB_TOKEN_SECRET_ARN:?GITHUB_TOKEN_SECRET_ARN env variable is required}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY env variable is required}"

echo "Fetching GitHub token"
token=$(aws secretsmanager get-secret-value --secret-id ${GITHUB_TOKEN_SECRET_ARN} --output=text --query=SecretString)

echo "Cloning ${GITHUB_REPOSITORY} repository"
repo_dir=$(mktemp -d)/repo
git clone https://${token}@github.com/${GITHUB_REPOSITORY}.git ${repo_dir}

latest_tag=$(git describe --tags `git rev-list --tags --max-count=1`)

echo "Switching to latest tag: ${latest_tag}"
git checkout ${latest_tag}

echo "Starting validation"
node validate.js ${repo_dir}

echo "Done"