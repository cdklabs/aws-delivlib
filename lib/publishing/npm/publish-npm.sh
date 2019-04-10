#!/bin/bash
set -euo pipefail

###
# Usage: ./publish-mvn.sh
#
# Publishes the content of a release bundle (current directory) to NPM.
###

if [[ "${FOR_REAL:-}" == "true" ]]; then
    dry_npm="npm"
else
    echo "================================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo ""
    echo "Supply FOR_REAL=true as an environment variable to do actual publishing!" >&2
    echo "================================================="
    dry_npm="echo npm"
fi

#######
# NPM #
#######

DISTTAG=${DISTTAG:-""}
if [ -n "${DISTTAG}" ]; then
    DISTTAG="--tag=${DISTTAG}"
fi

echo "📦 Publishing to NPM"

TOKENS=$(npm token list 2>&1 || echo '')
if echo ${TOKENS} | grep 'EAUTHUNKNOWN' > /dev/null; then
    echo "🔑 Can't list tokens - apparently missing authentication info"
    npm login
fi

found=false
for TGZ in $(find ${PWD}/js -iname '*.tgz'); do
    found=true

    # extract module name and version from the tarball (via package/package.json)
    packageInfo="$(tar -zxOf $TGZ package/package.json)"
    mod="$(node -e "console.log(${packageInfo}.name);")"
    ver="$(node -e "console.log(${packageInfo}.version);")"

    echo "-------------------------------------------------------------------------------------------------"
    echo "Publishing to npm: ${mod}@${ver} from $TGZ ${DISTTAG}"

    # check that the package is not already published using "npm view"
    # returns an empty string if the package exists, but version doesn't
    npm_view=$(npm view ${mod}@${ver} 2> /dev/null || true)
    if [ -z "${npm_view}" ]; then
        $dry_npm publish $TGZ --access=public ${DISTTAG} --loglevel=silly
    else
        echo "⚠️ Package ${mod}@${ver} already published. Skipping."
    fi
done

if ! $found; then
    echo "❌ No js/**/*.tgz files. Nothing to publish."
    exit 1
fi


echo "✅ All OK!"
