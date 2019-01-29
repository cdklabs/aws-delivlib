#!/bin/bash
set -euo pipefail
set -x
identity="$(aws sts get-caller-identity --output text | xargs)"
role_arn=$(echo "${identity}" | cut -d" " -f 2)

# role arn will look like this:
#     arn:aws:sts::712950704752:assumed-role/delivlib-test-e486dd-AssumeMe924099BB-1B4MOTFSLDZ2N/assume-role-test
actual_role_name=$(echo "${role_arn}" | cut -d"/" -f2)


if [ "${actual_role_name}" != "${EXPECTED_ROLE_NAME}" ]; then
  echo "Actual role name was ${actual_role_name} but we expected ${EXPECTED_ROLE_NAME}"
  exit 1
fi

