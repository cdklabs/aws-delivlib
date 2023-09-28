#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]
then
  echo "Usage: $0 <nuget-package.nupkg>"
  exit -1
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

NUGET_PACKAGE=$(cd $(dirname $1) && echo $PWD)/$(basename $1)
SIGNING_BUCKET_NAME='cdk-signing-bucket'
SIGNING_LAMBDA_NAME='cdk-signing-lambda'

##############################################################################
# Code for development - testing with .zip files
##############################################################################
echo "🔑 Applying authenticode signatures to assemblies in ${NUGET_PACKAGE}"
for FILE in ${NUGET_PACKAGE}/*.zip
do
  echo "📄 Assembly: ${FILE}"
  TMP=$(mktemp -d)
  # upload DLL to signing bucket
  VERSION_ID=$(aws s3api put-object \
    --bucket ${SIGNING_BUCKET_NAME} \
    --key unsigned/${FILE} \
    --body ${FILE} | jq -r '.VersionId')
  # invoke signing lambda
  aws lambda invoke \
    --function-name ${SIGNING_LAMBDA_NAME} \
    --invocation-type RequestResponse \
    --cli-binary-format raw-in-base64-out \
    --payload '{ "artifactKey": "'"unsigned/${FILE}"'", "artifactVersion": "'"${VERSION_ID}"'" }' \
    ${TMP}/response.json
  SIGNED_ARTIFACT_KEY=$(cat ${TMP}/response.json | jq -r '.signedArtifactKey')
  # download signed DLL from signing bucket
  aws s3api get-object \
    --bucket ${SIGNING_BUCKET_NAME} \
    --key ${SIGNED_ARTIFACT_KEY} \
    nuget-package-signed/artifact.zip
  rm -rf ${TMP}
done
echo "🔐 All Done!"

##############################################################################
# Code for production - will use .dll files - NOT COMPLETE
##############################################################################
# echo "🔑 Applying authenticode signatures to assemblies in ${NUGET_PACKAGE}"
# for FILE in $(unzip -Z1 ${NUGET_PACKAGE} '*dll')
# do
#   echo "📄 Assembly: ${FILE}"
#   TMP=$(mktemp -d)
#   # extract the DLL from the ZIP file
#   unzip -q ${NUGET_PACKAGE} -d ${TMP} ${FILE}
#   chmod u+rw ${TMP}/${FILE}
#   # upload DLL to signing bucket
#   VERSION_ID=$(aws s3api put-object \
#     --bucket ${SIGNING_BUCKET_NAME} \
#     --key unsigned/${FILE} \
#     --body ${TMP}/${FILE} | jq -r '.VersionId')
#   # invoke signing lambda
#   aws lambda invoke \
#     --function-name ${SIGNING_LAMBDA_NAME} \
#     --invocation-type Event \
#     --cli-binary-format raw-in-base64-out \
#     --payload '{ "artifactKey": "'"unsigned/${FILE}"'", "artifactVersion": "'"${VERSION_ID}"'" }' \
#     response.json
#   # download signed DLL from S3
# done
# echo "🔐 All Done!"

