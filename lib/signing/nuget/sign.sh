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

if [ -n "${ACCESS_ROLE_ARN:-}" ]; then
  ROLE=$(aws sts assume-role --role-arn "${ACCESS_ROLE_ARN:-}" --role-session-name "signer_access")
  export AWS_ACCESS_KEY_ID=$(echo $ROLE | jq -r .Credentials.AccessKeyId)
  export AWS_SECRET_ACCESS_KEY=$(echo $ROLE | jq -r .Credentials.SecretAccessKey)
  export AWS_SESSION_TOKEN=$(echo $ROLE | jq -r .Credentials.SessionToken)
fi

found=false
for nuget_package_path in $(find dotnet -name *.nupkg -not -iname *.symbols.nupkg); do
  found=true
  nuget_package=$(cd $(dirname ${nuget_package_path}) && echo $PWD)/$(basename ${nuget_package_path})
  echo "🔑 Applying authenticode signatures to assemblies in ${nuget_package}"
  for file in $(unzip -Z1 ${nuget_package} '*.dll'); do
    echo "📄 Assembly: ${file}"
    tmp=$(mktemp -d)
    # extract the dll from the zip file
    unzip -q ${nuget_package} -d ${tmp} ${file}
    # need to set appropriate permissions, otherwise the file has none
    chmod u+rw ${tmp}/${file}
    # upload dll to signer bucket
    version_id=$(aws s3api put-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key unsigned/${file} \
      --body ${tmp}/${file} | jq -r '.VersionId')
    # invoke signer lambda
    aws lambda invoke \
      --function-name ${SIGNING_LAMBDA_ARN:-} \
      --invocation-type RequestResponse \
      --cli-binary-format raw-in-base64-out \
      --payload '{ "artifactKey": "'"unsigned/${file}"'", "artifactVersion": "'"${version_id}"'", "profileName": "'"${SIGNER_PROFILE_NAME:-}"'", "profileOwner": "'"${SIGNER_PROFILE_OWNER:-}"'" }' \
      ${tmp}/response.json >/dev/null
    signed_artifact_key=$(cat ${tmp}/response.json | jq -r '.signedArtifactKey')
    # download signed dll from signer bucket
    aws s3api get-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key ${signed_artifact_key} \
      ${tmp}/${file} >/dev/null
    # replace the dll in the nuget package
    (
      cd ${tmp}
      zip -qfr ${nuget_package} ${file}
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
