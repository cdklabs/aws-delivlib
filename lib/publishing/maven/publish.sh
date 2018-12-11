#!/bin/bash
set -euo pipefail
echo ----------------------------------------
echo "Sources:"
ls
echo ----------------------------------------

# We need Maven
echo "Installing Maven..."
apt-get update > /dev/null && apt-get install -y maven

echo "Getting credentials..."
credentials=$(aws secretsmanager get-secret-value --secret-id ${MAVEN_LOGIN_SECRET} --output=text --query=SecretString)

export MAVEN_USERNAME=$(node -e "console.log(${credentials}.username);")
export MAVEN_PASSWORD=$(node -e "console.log(${credentials}.password);")

$SCRIPT_DIR/with-signing-key.sh $SCRIPT_DIR/publish-mvn.sh
