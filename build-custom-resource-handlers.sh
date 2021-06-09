#!/bin/bash
set -euo pipefail

compile="tsc --alwaysStrict
             --inlineSourceMap
             --lib ES2017
             --module CommonJS
             --moduleResolution Node
             --noFallthroughCasesInSwitch
             --noImplicitAny
             --noImplicitReturns
             --noImplicitThis
             --noUnusedLocals
             --noUnusedParameters
             --removeComments
             --strict
             --target ES2017
             --types node"

for handler in pgp-secret private-key certificate-signing-request
do
  echo "Building CustomResource handler ${handler}"
  ${compile}                                                                    \
    --incremental                                                               \
    --tsBuildInfoFile "./lib/custom-resource-handlers/src/${handler}.tsbuildinfo"   \
    --outDir "./lib/custom-resource-handlers/bin/${handler}"                        \
    "./lib/custom-resource-handlers/src/${handler}.ts"                              \
    ./lib/custom-resource-handlers/src/_*.ts
  cp "./lib/custom-resource-handlers/bin/${handler}/${handler}.js" "./lib/custom-resource-handlers/bin/${handler}/index.js"
done
