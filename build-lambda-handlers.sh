#!/bin/bash
set -euo pipefail

if ! npm ci --help; then
  echo "upgrading npm, because 'npm ci' is not supported"
  npm i -g npm@~6.8.0
fi

(
  cd change-control-lambda
  npm ci # Will install dependencies & run "prepare", which will run tsc
)
