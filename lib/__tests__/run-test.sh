#!/bin/bash
set -euo pipefail
scriptdir=$(cd $(dirname $0) && pwd)

cdk_app="${scriptdir}/integ.delivlib.js"
expected="${scriptdir}/expected.yml"
actual="/tmp/actual.json"

custom_stack_name="${TEST_STACK_NAME:-}"

export TEST_STACK_NAME="delivlib-test"

if [ "${1:-}" == "synth" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} synth
  exit 0
fi

npx cdk --no-version-reporting --no-asset-metadata -a ${cdk_app} synth > ${actual}

if [ "${1:-}" == "update" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} deploy ${2:-} ${3:-} ${4:-}
  echo "Stack deployed, now, go to the console and wait for the pipeline to fully stabalize"
  echo "Press ENTER to confirm that pipeline is green"
  read
  echo "Okay, now go to CFN console and delete the test stack ${TEST_STACK_NAME}"
  echo "Press ENTER to confirm that the stack has been deleted"
  read
  cp -f ${actual} ${expected}
fi

diff ${actual} ${expected} || {
  echo "Expected test stack template does not match synthesized output"
  echo "To update expectations: 'npm test update'"
  exit 1
}
