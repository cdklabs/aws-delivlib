#!/bin/bash
set -euo pipefail

# load login credentials from secrets manager
credentials=$(aws secretsmanager get-secret-value --secret-id ${PYPI_CREDENTIALS_SECRET_ID} --output=text --query=SecretString)
export TWINE_USERNAME=$(python -c "import json; print(json.loads('''${credentials}''')['username'])")
export TWINE_PASSWORD=$(python -c "import json; print(json.loads('''${credentials}''')['password'])")

pip install twine

twine upload --skip-existing python/**
