#!/bin/bash
set -euo pipefail
scriptdir=$(cd $(dirname $0) && pwd)

cdk_app="npx ts-node lib/__tests__/integ.delivlib.ts"

if [ "${1:-}" == "diff" ]; then
  echo "I have disabled snapshot tests here and I'm not apologizing for it [- huijbers@]"
  exit 0
fi

export TEST_STACK_NAME="delivlib-test"

if [ "${1:-}" == "update" ]; then
  npx cdk --no-version-reporting -a "${cdk_app}" deploy ${2:-} ${3:-} ${4:-}
  echo "Stack deployed, now, go to the console and wait for the pipeline to fully stabalize"
fi
