#!/bin/bash
set -euo pipefail

(
  cd change-control-lambda
  npm ci # Will install dependencies & run "prepare", which will run tsc
)
