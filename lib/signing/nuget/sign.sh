#!/bin/bash
set -euo pipefail

echo "Installing required CLI tools: jq"
if command -v yum &>/dev/null; then
    yum install -y jq
elif command -v apt-get &>/dev/null; then
    apt-get update
    apt-get install -y jq
else
    echo "!!! Neither an apt nor yum distribution - could not install jq, things might break!"
fi

if [ -n "${SIGNER_ACCESS_ROLE_ARN:-}" ]; then
  ROLE=$(aws sts assume-role --role-arn "${SIGNER_ACCESS_ROLE_ARN:-}" --role-session-name "signer_access")
  export AWS_ACCESS_KEY_ID=$(echo $ROLE | jq -r .Credentials.AccessKeyId)
  export AWS_SECRET_ACCESS_KEY=$(echo $ROLE | jq -r .Credentials.SecretAccessKey)
  export AWS_SESSION_TOKEN=$(echo $ROLE | jq -r .Credentials.SessionToken)
fi

found=false
for nuget_package_path in $(find dotnet -name *.nupkg -not -iname *.symbols.nupkg); do
  found=true
  echo "🔑 Applying authenticode signatures to assemblies in ${nuget_package_path}"
  for file in $(unzip -Z1 ${nuget_package_path} '*.dll'); do
    echo "📄 Assemby: ${file}"
    tmp=$(mktemp -d)
    # upload zip to signer bucket
    version_id=$(aws s3api put-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key unsigned/${file} \
      --body ${file} | jq -r '.VersionId')
    # invoke signer lambda
    aws lambda invoke \
      --function-name ${SIGNING_LAMBDA_NAME:-} \
      --invocation-type RequestResponse \
      --cli-binary-format raw-in-base64-out \
      --payload '{ "artifactKey": "'"unsigned/${file}"'", "artifactVersion": "'"${version_id}"'" }' \
      ${tmp}/response.json >/dev/null
    signed_artifact_key=$(cat ${tmp}/response.json | jq -r '.signedArtifactKey')
    # download signed zip from signer bucket
    aws s3api get-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key ${signed_artifact_key} \
      nuget-package-signed/artifact.zip >/dev/null
    # replace the dll in the nuget package
    (
      cd ${tmp}
      zip -qfr ${nuget_package_path} ${file}
    )
    # clean up temporary directory
    rm -rf ${tmp}
  done
  echo "🔐 All Done!"
done

if ! ${found}; then
  echo "❌ No nupkg files found under the dotnet/ directory. Nothing to sign"
  exit 1
fi
