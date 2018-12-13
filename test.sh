#!/bin/bash
set -euo pipefail

# unit tests
jest

# regression test (compares a full stack against an expected output)
/bin/bash test/run-test.sh $@
