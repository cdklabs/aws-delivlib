#!/bin/bash
set -eu # we don't want "pipefail" to implement idempotency

echo "Installing jq..."
apt update
apt install jq -y

if [ -n "${CODE_SIGNING_SECRET_ID:-}" ]; then
    declare -a CLEANUP=()
    function cleanup() {
        for ((i = 0; i < ${#CLEANUP[@]}; i++ ))
        do
            eval "${CLEANUP[$i]}"
        done
        echo '🍻 Done!'
    }
    trap cleanup 'EXIT'

    echo "Preparing code-signing certificate..."
    cert=$(mktemp -d)
    CLEANUP+=("echo '🚮 Cleaning code-signing certificate'" "rm -fr ${cert}")
    aws secretsmanager get-secret-value --secret-id "${CODE_SIGNING_SECRET_ID}" | jq -r .SecretString > "${cert}/data.json"
    # Transform the certificate into the format expected by signcode
    SIGNCODE_SPC="${cert}/certificate.spc"
    jq -r .Certificate "${cert}/data.json" > "${SIGNCODE_SPC}.pem"
    openssl crl2pkcs7 -nocrl -certfile "${SIGNCODE_SPC}.pem" -outform DER -out "${SIGNCODE_SPC}"
    # Transform the private key into the format expected by signcode
    SIGNCODE_PVK="${cert}/certificate.pvk"
    jq -r .PrivateKey "${cert}/data.json" > "${SIGNCODE_PVK}.pem"
    openssl rsa -in "${SIGNCODE_PVK}.pem" -outform PVK -pvk-none -out "${SIGNCODE_PVK}"
    # Set the timestamp server
    SIGNCODE_TSS="${CODE_SIGNING_TIMESTAMP_SERVER:-http://timestamp.digicert.com}"
fi

echo "Publishing NuGet packages..."

if [ -n "${NUGET_ROLE_ARN:-}" ]; then
    ROLE=$(aws sts assume-role --region "${NUGET_SECRET_REGION:-}" --role-arn "${NUGET_ROLE_ARN:-}" --role-session-name "buildable_nuget_publish")
    export AWS_ACCESS_KEY_ID=$(echo $ROLE | jq -r .Credentials.AccessKeyId)
    export AWS_SECRET_ACCESS_KEY=$(echo $ROLE | jq -r .Credentials.SecretAccessKey)
    export AWS_SESSION_TOKEN=$(echo $ROLE | jq -r .Credentials.SessionToken)
fi

NUGET_SOURCE="https://api.nuget.org/v3/index.json"
NUGET_SYMBOL_SOURCE="https://nuget.smbsrc.net/"
NUGET_API_KEY=$(aws secretsmanager get-secret-value --region "${NUGET_SECRET_REGION:-}" --secret-id "${NUGET_SECRET_ID:-}" | jq -r .SecretString | jq -r .NugetApiKey)

log=$(mktemp -d)/log.txt

found=false
for NUGET_PACKAGE_PATH in $(find dotnet -name *.nupkg -not -iname *.symbols.nupkg); do
    found=true
    if [ -n "${CODE_SIGNING_SECRET_ID:-}" ]; then
        ./sign.sh "${NUGET_PACKAGE_PATH}" "${SIGNCODE_SPC}" "${SIGNCODE_PVK}" "${SIGNCODE_TSS}"
    fi
    dotnet nuget push $NUGET_PACKAGE_PATH -k $NUGET_API_KEY -s $NUGET_SOURCE -ss $NUGET_SYMBOL_SOURCE | tee ${log}

    # If push failed, check if this was caused because we are trying to publish
    # the same version again, which is not an error by searching for a magic string in the log
    # ugly, yes!
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        if cat ${log} | grep -q "already exists and cannot be modified"; then
            echo "⚠️ Artifact already published. Skipping"
        else
            echo "❌ Release failed"
            exit 1
        fi
    fi
done

if ! ${found}; then
    echo "❌ No nupkg files found under the dotnet/ directory. Nothing to publish"
    exit 1
fi

echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo "✅ All Done!"
