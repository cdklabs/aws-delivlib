This directory contains ZIP files that are used as Lambda layers by our custom resources
(private-key, pgp-secret and certificate-signing-request).
Those Lambdas shell out to the `openssl` and `gpg` tools,
which are not shipped with Node Lambda version older than 8.

If you ever need to update these,
unzip these files, add any necessary binaries to it,
and then zip them back up again.

The binaries contained in these files were downloaded from an EC2 instance
running Amazon Linux 2.
