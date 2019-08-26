#!/bin/bash
set -euo pipefail

if [ $# -ne 4 ]
then
  echo "Usage: $0 <nuget-package.nupkg> <certificate.spc> <privatekey.pvk> <timestamp-url>"
  exit -1
fi
NUGET_PACKAGE=$(cd $(dirname $1) && echo $PWD)/$(basename $1)
SOFTWARE_PUBLISHER_CERTIFICATE=$2
PRIVATE_KEY=$3
TIMESTAMP_URL=$4

echo "🔑 Applying authenticode signatures to assemblies in ${NUGET_PACKAGE}"
for FILE in $(unzip -Z1 ${NUGET_PACKAGE} '*.dll')
do
  echo "📄 Assemby: ${FILE}"
  TMP=$(mktemp -d)
  # Extract the DLL from the ZIP file
  unzip -q ${NUGET_PACKAGE} -d ${TMP} ${FILE}
  # Need to set appropriate permissions, otherwise the file has none.
  chmod u+rw ${TMP}/${FILE}
  # Sign the DLL
  signcode  -a    sha256                                                        \
            -spc  ${SOFTWARE_PUBLISHER_CERTIFICATE}                             \
            -v    ${PRIVATE_KEY}                                                \
            -t    ${TIMESTAMP_URL}                                              \
            ${TMP}/${FILE}
  # Replace the DLL in the NuGet package
  (
    cd ${TMP} # Need to step in so the TMP prefix isn't mirrored in the ZIP -_-
    zip -qfr ${NUGET_PACKAGE} ${FILE}
  )
  # Clean up temporary directory
  rm -fr ${TMP}
done
echo "🔐 All Done!"
