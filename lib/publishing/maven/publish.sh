#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

if [[ ! -d ./java ]]; then
    echo "❌ No JARS to publish: 'java/' directory is missing."
    exit 1
fi

echo "Getting credentials..."
credentials=$(aws secretsmanager get-secret-value --secret-id ${MAVEN_LOGIN_SECRET} --output=text --query=SecretString)

export MAVEN_USERNAME=$(node -e "console.log(${credentials}.username);")
export MAVEN_PASSWORD=$(node -e "console.log(${credentials}.password);")

chmod +x $SCRIPT_DIR/with-signing-key.sh
$SCRIPT_DIR/with-signing-key.sh npx -p publib@latest publib-maven ./java

/bin/bash $SCRIPT_DIR/update-ssm.sh
