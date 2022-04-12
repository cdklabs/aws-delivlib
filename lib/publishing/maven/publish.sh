#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

MAVEN_LOGIN_SECRET_USERNAME_KEY="${MAVEN_LOGIN_SECRET_USERNAME_KEY:-username}"
MAVEN_LOGIN_SECRET_PASSWORD_KEY="${MAVEN_LOGIN_SECRET_PASSWORD_KEY:-password}"
echo "Getting credentials..."
credentials=$(aws secretsmanager get-secret-value --secret-id ${MAVEN_LOGIN_SECRET} --output=text --query=SecretString)

export MAVEN_USERNAME=$(node -e "console.log(${credentials}.${MAVEN_LOGIN_SECRET_USERNAME_KEY});")
export MAVEN_PASSWORD=$(node -e "console.log(${credentials}.${MAVEN_LOGIN_SECRET_PASSWORD_KEY});")

chmod +x $SCRIPT_DIR/with-signing-key.sh
chmod +x $SCRIPT_DIR/publish-mvn.sh
$SCRIPT_DIR/with-signing-key.sh $SCRIPT_DIR/publish-mvn.sh
