#!/bin/bash
set -eu # we don't want "pipefail" to implement idempotency

###
# Usage: ./publish-mvn.sh
#
# Publishes the content of a release bundle (current directory)to Maven Central.
#
# This script expects the following environment variables to be set to appropriate
# values (which can be achieved by using scripts/with-signing-key.sh):
#
# + GNUPGHOME       - A GnuPG home directory containing the signing key
# + KEY_ID          - The ID of the GnuPG key that will be used for signing
# + KEY_PASSPHRASE  - The passphrase of the provided key.
# + FOR_REAL        - Set to "true" to do actual publishing
# + STAGING_PROFILE_ID - The Maven Central (sonatype) staging profile ID (e.g. 68a05363083174)
# + MAVEN_USERNAME - User name for Sonatype
# + MAVEN_PASSWORD - Password for Sonatype
###

error() { echo "❌ $@"; exit 1; }

[ -z "${GNUPGHOME:-}" ] && error "GNUPGHOME is required"
[ -z "${KEY_ID:-}" ] && error "KEY_ID is required"
[ -z "${KEY_PASSPHRASE:-}" ] && echo "KEY_PASSPHRASE is required"
[ -z "${STAGING_PROFILE_ID:-}" ] && echo "STAGING_PROFILE_ID is required"
[ -z "${MAVEN_USERNAME:-}" ] && echo "MAVEN_USERNAME is required"
[ -z "${MAVEN_PASSWORD:-}" ] && echo "MAVEN_PASSWORD is required"

if [[ "${FOR_REAL:-}" == "true" ]]; then
    mvn=mvn
    dry_run=false
else
    echo "==========================================="
    echo "            🏜️ DRY-RUN MODE 🏜️"
    echo
    echo "Set FOR_REAL=true to do actual publishing!"
    echo "==========================================="
    mvn="echo mvn"
    dry_run=true
fi

staging=$(mktemp -d)
workdir=$(mktemp -d)

if [[ ! -d ./java ]]; then
    echo "❌ No JARS to publish: 'java/' directory is missing."
    exit 1
fi

echo "📦 Publishing to Maven Central"

# Create a settings.xml file with the user+password for maven
mvn_settings="${workdir}/mvn-settings.xml"
cat > ${mvn_settings} <<-EOF
<?xml version="1.0" encoding="UTF-8" ?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                              http://maven.apache.org/xsd/settings-1.0.0.xsd">
  <servers>
    <server>
      <id>ossrh</id>
      <username>${MAVEN_USERNAME}</username>
      <password>${MAVEN_PASSWORD}</password>
    </server>
  </servers>
</settings>
EOF

echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo " Preparing repository"
echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"

# Sign and stage our artifacts into a local directory
found=false
for pom in $(find ./java -name '*.pom'); do
    found=true

    source_arg=""
    if [[ -f ${pom/.pom/-sources.jar} ]]; then
      source_arg="-Dsources=${pom/.pom/-sources.jar}"
    fi

    javadoc_arg=""
    if [[ -f ${pom/.pom/-javadoc.jar} ]]; then
      javadoc_arg="-Djavadoc=${pom/.pom/-javadoc.jar}"
    fi

    $mvn --settings=${mvn_settings} gpg:sign-and-deploy-file                        \
            -Durl=file://${staging}                                                 \
            -DrepositoryId=maven-central                                            \
            -Dgpg.homedir=${GNUPGHOME}                                              \
            -Dgpg.keyname=0x${KEY_ID}                                               \
            -Dgpg.passphrase=${KEY_PASSPHRASE}                                      \
            -DpomFile=${pom}                                                        \
            -Dfile=${pom/.pom/.jar}                                                 \
            $source_arg                                                             \
            $javadoc_arg
done

if ! $found; then
    echo "❌ No JARS to publish: no .pom files found in java/ directory."
    exit 1
fi

echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo " Deploying and closing repository..."
echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"

staging_output="${workdir}/deploy-output.txt"
$mvn --settings=${mvn_settings}                                                    \
    org.sonatype.plugins:nexus-staging-maven-plugin:1.6.13:deploy-staged-repository \
    -DrepositoryDirectory=${staging}                                               \
    -DnexusUrl=${MAVEN_ENDPOINT:-https://oss.sonatype.org}                                            \
    -DserverId=ossrh                                                               \
    -DautoReleaseAfterClose=true                                                   \
    -DstagingProfileId=${STAGING_PROFILE_ID} | tee ${staging_output}

# we need to consule PIPESTATUS sinec "tee" is the last command
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "❌ Repository deployment failed"
    exit 1
fi

echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo " Releasing repository"
echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"

# Extract the ID of the closed repository from the log output of "deploy-staged-repository"
# This is because "deploy-staged-repository" doesn't seem to support autoReleaseAfterClose
# See https://issues.sonatype.org/browse/OSSRH-42487
if $dry_run; then
    echo 'Closing staging repository with ID "dummyrepo"' > ${staging_output}
fi

repository_id="$(cat ${staging_output} | grep "Closing staging repository with ID" | cut -d'"' -f2)"
if [ -z "${repository_id}" ]; then
    echo "❌ Unable to extract repository ID from deploy-staged-repository output."
    echo "This means it failed to close or there was an unexpected problem."
    echo "At any rate, we can't release it. Sorry"
    exit 1
fi

echo "Repository ID: ${repository_id}"

# Create a dummy pom.xml because the "release" goal needs one, but it doesn't care about it at all
release_pom="${workdir}/release-pom.xml"
cat > ${release_pom} <<HERE
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>dummy</groupId>
  <artifactId>dummy</artifactId>
  <version>0.0.0</version>
</project>
HERE

# Release!
release_output="${workdir}/release-output.txt"
$mvn --settings ${mvn_settings} -f ${release_pom} \
    org.sonatype.plugins:nexus-staging-maven-plugin:1.6.13:release \
    -DserverId=ossrh \
    -DnexusUrl=${MAVEN_ENDPOINT:-https://oss.sonatype.org} \
    -DstagingProfileId=${STAGING_PROFILE_ID} \
    -DstagingRepositoryId=${repository_id} | tee ${release_output}

# If release failed, check if this was caused because we are trying to publish
# the same version again, which is not an error. The magic string "does not
# allow updating artifact" for a ".pom" file indicates that we are trying to
# override an existing version. Otherwise, fail!
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    if cat ${release_output} | grep "does not allow updating artifact" | grep -q ".pom"; then
        echo "⚠️ Artifact already published. Skipping"
    else
        echo "❌ Release failed"
        exit 1
    fi
fi

echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo "✅ All Done!"
