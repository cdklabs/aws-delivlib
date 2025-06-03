#!/bin/bash
# Run another command with the signing key for the current scope,
# if set.
#
# Upon running the subcommand, $KEY_AVAILABLE will be set to either
# 'true' or 'false'. If $KEY_AVAILABLE is 'true', the following
# variables will be set as well:
#
#    $MAVEN_GPG_PRIVATE_KEY
#    $MAVEN_GPG_PRIVATE_KEY_PASSPHRASE
#
# These will be used by `publib-maven`.
#
# See <https://github.com/cdklabs/publib?tab=readme-ov-file#maven>.
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
    echo "Usage: with-signing-key.sh CMD [ARG...]" >&2
    echo "">&2
    echo "Run another command with a preloaded GPG keyring." >&2
    exit 1
fi

if [[ "${SIGNING_KEY_ARN:-}" == "" ]]; then
    echo "SIGNING_KEY_ARN not set, running without a key" >&2
    export KEY_AVAILABLE=false
else
    tmpdir=$(mktemp -d)
    trap "find $tmpdir -type f -exec rm {} \\; && rm -rf $tmpdir" EXIT

    # Use secrets manager to obtain the key and passphrase into a JSON file
    echo "Retrieving key $SIGNING_KEY_ARN..." >&2
    aws secretsmanager get-secret-value --secret-id "$SIGNING_KEY_ARN" --output text --query SecretString > $tmpdir/secret.txt

    value-from-secret() {
        node -e "console.log(JSON.parse(require('fs').readFileSync('$tmpdir/secret.txt', { encoding: 'utf-8' })).$1)"
    }

    export KEY_AVAILABLE=true
    export MAVEN_GPG_PRIVATE_KEY=$(value-from-secret PrivateKey)
    export MAVEN_GPG_PRIVATE_KEY_PASSPHRASE=$(value-from-secret Passphrase)
fi

# Execute remaining commands
echo "Running: $@" >&2
"$@"
