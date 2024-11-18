#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# Prepare the NPM publishing token
secret=$(aws secretsmanager get-secret-value --secret-id $NPM_TOKEN_SECRET --output=text --query=SecretString)
token=$(node -e "console.log(${secret}.token);")

export NPM_TOKEN=$token

# Creating an .npmrc that references an envvar is what you're supposed to do.
# https://docs.npmjs.com/private-modules/ci-server-config
echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc

# Call publishing script
/bin/bash $SCRIPT_DIR/publish-npm.sh
/bin/bash $SCRIPT_DIR/update-ssm.sh
