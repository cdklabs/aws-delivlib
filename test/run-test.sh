#!/bin/bash
set -euo pipefail
if [ ! -f package.json ]; then
  echo "Expected to run from pacakge root"
  exit 1
fi

cdk_app="test/integ.delivlib.js"
expected="test/expected.json"
actual="/tmp/actual.json"

if [ "${1:-}" == "diff" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} diff
  exit 0
fi

if [ "${1:-}" == "synth" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} synth
  exit 0
fi

npx cdk --no-version-reporting -a ${cdk_app} synth > ${actual}

if [ "${1:-}" == "update" ]; then
  npx cdk --no-version-reporting -a ${cdk_app} deploy ${2:-} ${3:-} ${4:-}
  cp -f ${actual} ${expected}
fi

diff ${actual} ${expected} || {
  echo "Expected test stack template does not match synthesized output"
  echo "To update expectations: 'npm test update'"
  exit 1
}
