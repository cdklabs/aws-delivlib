#!/bin/bash
set -euo pipefail
tarball=$(npm pack)
rm -fr dist
mkdir -p dist/js
mv ${tarball} dist/js/


