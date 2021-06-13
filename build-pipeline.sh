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

${compile} ./pipeline/delivlib.ts                                                                    \
