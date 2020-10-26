#!/bin/bash
set -euo pipefail

(
  cd change-control-lambda
  yarn install --frozen-lockfile
)
