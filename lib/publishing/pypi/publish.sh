#!/bin/bash
set -euo pipefail

PYPI_CREDENTIALS_SECRET_ID_USERNAME_KEY="${PYPI_CREDENTIALS_SECRET_ID_USERNAME_KEY:-username}"
PYPI_CREDENTIALS_SECRET_ID_PASSWORD_KEY="${PYPI_CREDENTIALS_SECRET_ID_PASSWORD_KEY:-password}"
# load login credentials from secrets manager
credentials=$(aws secretsmanager get-secret-value --secret-id ${PYPI_CREDENTIALS_SECRET_ID} --output=text --query=SecretString)
export TWINE_USERNAME=$(python -c "import json; print(json.loads('''${credentials}''')['${PYPI_CREDENTIALS_SECRET_ID_USERNAME_KEY}'])")
export TWINE_PASSWORD=$(python -c "import json; print(json.loads('''${credentials}''')['${PYPI_CREDENTIALS_SECRET_ID_PASSWORD_KEY}'])")

# make sure we use the latest pip
# see https://cryptography.io/en/latest/faq.html#installing-cryptography-fails-with-error-can-not-find-rust-compiler
pip install --upgrade pip

pip install twine

if [[ "${FOR_REAL:-}" == "true" ]]; then
  twine upload --skip-existing python/**
else
  echo "==========================================="
  echo "            🏜️ DRY-RUN MODE 🏜️"
  echo
  echo "Skipping the actual publishing step."
  echo
  echo "Set FOR_REAL=true to do it!"
  echo "==========================================="
fi
