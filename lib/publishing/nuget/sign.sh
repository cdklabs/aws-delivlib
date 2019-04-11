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

# Ensure osslsigncode is available...
command -v osslsigncode > /dev/null || {
  # It's not available for Ubuntu trusty, so we'll have to back-port it from Xenial
  echo "Installing osslsigncode..."
  echo "deb http://archive.ubuntu.com/ubuntu/ xenial main restricted universe" > /etc/apt/sources.list.d/xenial.list \
    && echo "deb http://security.ubuntu.com/ubuntu/ xenial-security main restricted universe" >> /etc/apt/sources.list.d/xenial.list \
    && echo "Package: *" > /etc/apt/preferences.d/xenial.pref                  \
    && echo "Pin: release n=xenial" >> /etc/apt/preferences.d/xenial.pref      \
    && echo "Pin-Priority: -10" >> /etc/apt/preferences.d/xenial.pref          \
    && echo "" >> /etc/apt/preferences.d/xenial.pref                           \
    && echo "Package: osslsigncode" >> /etc/apt/preferences.d/xenial.pref      \
    && echo "Pin: release n=xenial" >> /etc/apt/preferences.d/xenial.pref      \
    && echo "Pin-Priority: 500" >> /etc/apt/preferences.d/xenial.pref          \
    && apt-get update                                                          \
    && apt-get install -y osslsigncode
}

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
  osslsigncode -h sha256                                                       \
               -certs ${SOFTWARE_PUBLISHER_CERTIFICATE}                        \
               -key   ${PRIVATE_KEY}                                           \
               -t     ${TIMESTAMP_URL}                                         \
               -in    ${TMP}/${FILE}                                           \
               -out   ${TMP}/${FILE}.signed
  # Replace the un-signed binary with the signed one
  mv ${TMP}/${FILE}.signed ${TMP}/${FILE}
  # Replace the DLL in the NuGet package
  (
    cd ${TMP} # Need to step in so the TMP prefix isn't mirrored in the ZIP -_-
    zip -qfr ${NUGET_PACKAGE} ${FILE}
  )
  # Clean up temporary directory
  rm -fr ${TMP}
done
echo "🔐 All Done!"
