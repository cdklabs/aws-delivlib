#!/bin/bash
set -euo pipefail

files="$(find . -type f | cut -d'/' -f2-)"

echo "<html>"
echo "<body>"
echo "<h3>Release Artifacts</h3>"

for file in $files; do
    s3url="s3://${RELEASE_BUCKET}${RELEASE_KEY_PREFIX}/${file}"
    presigned="$(aws s3 presign --expires $EXPIRES --region $REGION $s3url)"
    echo "<li>"
    echo "  <a href="$presigned">"
    echo "    $file"
    echo "  </a>"
    echo "</li>"
done

echo "</body>"
echo "</html>"
