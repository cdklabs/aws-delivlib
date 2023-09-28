#!/bin/bash

if [ $# -ne 1 ]
then
  echo "Usage: $0 <nuget-package.nupkg>"
  exit -1
fi

if [[ "${FOR_REAL:-}" == "true" ]]
then
  echo "============================================================================"
  echo "Executing in production environment"
  echo
  echo "Set environment variable FOR_REAL=false for development environment!"
  echo "============================================================================"
  ENV="prod"
else
  echo "============================================================================"
  echo "Executing in development environment"
  echo
  echo "While in development you must set the following environment variables:"
  echo "  1. SIGNER_ACCESS_ROLE_ARN"
  echo "  2. SIGNING_BUCKET_NAME"
  echo "  3. SIGNING_LAMBDA_NAME"
  echo
  echo "Set environment variable FOR_REAL=true for production environment!"
  echo "============================================================================"
  ENV="dev"
fi

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

NUGET_PACKAGE=$(cd $(dirname $1) && echo $PWD)/$(basename $1)

echo "🔑 Applying authenticode signatures to assemblies in ${NUGET_PACKAGE}"
if [[ "${ENV}" == "dev" ]]
then
  for file in ${NUGET_PACKAGE}/*.zip
  do
    echo "📄 Assembly: ${file}"
    tmp=$(mktemp -d)
    # upload zip to signer bucket
    version_id=$(aws s3api put-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key unsigned/${file} \
      --body ${file} | jq -r '.VersionId' )
    # invoke signer lambda
    aws lambda invoke \
      --function-name ${SIGNING_LAMBDA_NAME:-} \
      --invocation-type RequestResponse \
      --cli-binary-format raw-in-base64-out \
      --payload '{ "artifactKey": "'"unsigned/${file}"'", "artifactVersion": "'"${version_id}"'" }' \
      ${tmp}/response.json
    signed_artifact_key=$(cat ${tmp}/response.json | jq -r '.signedArtifactKey')
    # download signed zip from signer bucket
    aws s3api get-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key ${signed_artifact_key} \
      nuget-package-signed/artifact.zip
    # clean up temporary directory
    rm -rf ${tmp}
  done
else
  for file in $(unzip -Z1 ${NUGET_PACKAGE} '*dll')
  do
    echo "📄 Assembly: ${file}"
    tmp=$(mktemp -d)
    # extract the dll from the zip file
    unzip -q ${NUGET_PACKAGE} -d ${tmp} ${file}
    # need to set appropriate permissions, otherwise the file has none
    chmod u+rw ${tmp}/${file}
    # upload dll to signer bucket
    version_id=$(aws s3api put-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key unsigned/${file} \
      --body ${file} | jq -r '.VersionId' )
    # invoke signer lambda
    aws lambda invoke \
      --function-name ${SIGNING_LAMBDA_NAME:-} \
      --invocation-type RequestResponse \
      --cli-binary-format raw-in-base64-out \
      --payload '{ "artifactKey": "'"unsigned/${file}"'", "artifactVersion": "'"${version_id}"'" }' \
      ${tmp}/response.json
    signed_artifact_key=$(cat ${tmp}/response.json | jq -r '.signedArtifactKey')
    # download signed dll from signer bucket
    aws s3api get-object \
      --bucket ${SIGNING_BUCKET_NAME:-} \
      --key ${signed_artifact_key} \
      ${tmp}/${file}
    # replace the dll in the nuget package
    (
      cd ${tmp}
      zip -qfr ${NUGET_PACKAGE} ${file}
    )
    # clean up temporary directory
    rm -rf ${tmp}
  done
fi
echo "🔐 All Done!"

