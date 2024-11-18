#!/bin/bash
set -euo pipefail

# load login credentials from secrets manager
credentials=$(aws secretsmanager get-secret-value --secret-id ${PYPI_CREDENTIALS_SECRET_ID} --output=text --query=SecretString)
export TWINE_USERNAME=$(python -c "import json; print(json.loads('''${credentials}''')['username'])")
export TWINE_PASSWORD=$(python -c "import json; print(json.loads('''${credentials}''')['password'])")

# make sure we use the latest pip
# see https://cryptography.io/en/latest/faq.html#installing-cryptography-fails-with-error-can-not-find-rust-compiler
pip install --upgrade pip

pip install twine

if [[ "${FOR_REAL:-}" == "true" ]]; then
  twine upload --skip-existing python/**

  # NOTE: Not possible to detect whether the upload was skipped or not, so we'll
  # compare against the previous version to see if we need to update the timestamp.
  if [[ "${SSM_PREFIX:-}" != "" ]]; then
      build_manifest="${BUILD_MANIFEST:-"./build.json"}"
      version="$(node -p "require('${build_manifest}').version")"

      cur_version=$(aws ssm get-parameter --name "$SSM_PREFIX/version" --output text --query 'Parameter.Value' || echo '')

      if [[ "$cur_version" != "$version" ]]; then
        $dry_aws ssm put-parameter --name "$SSM_PREFIX/version" --type "String" --value "$version" --overwrite
        $dry_aws ssm put-parameter --name "$SSM_PREFIX/timestamp" --type "String" --value "$(date +%s)" --overwrite
      fi
  fi
else
  echo "==========================================="
  echo "            🏜️ DRY-RUN MODE 🏜️"
  echo
  echo "Skipping the actual publishing step."
  echo
  echo "Set FOR_REAL=true to do it!"
  echo "==========================================="
fi
