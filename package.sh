#!/bin/bash
set -euo pipefail
tarball=$(npm pack)
mkdir -p dist/js
mv ${tarball} dist/js/
