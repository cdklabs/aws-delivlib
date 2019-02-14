#!/bin/bash
set -euo pipefail
if [ ! -f package.json ]; then
  echo "Expected to run from pacakge root"
  exit 1
fi

cdk_app="test/integ.delivlib.js"
expected="test/expected.json"
actual="/tmp/actual.json"

export TEST_STACK_NAME="delivlib-test"

if [ "${1:-}" == "synth" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} synth
  exit 0
fi

npx cdk --no-version-reporting --no-asset-metadata -a ${cdk_app} synth > ${actual}

if [ "${1:-}" == "update" ]; then
  hash="$(cat ${actual} | shasum | cut -c1-6 | xargs)"
  export TEST_STACK_NAME="delivlib-test-${hash}"
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
