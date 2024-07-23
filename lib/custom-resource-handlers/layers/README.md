This directory contains ZIP files that are used as Lambda layers by our custom
resources (private-key, pgp-secret and certificate-signing-request).  Those
Lambdas shell out to the following tools:

- `gpg`
- `gpg-agent`
- `openssl`

Only `gpg` is installed on the Lambda Runtime by default, the others are not
(inspect Docker image `public.ecr.aws/lambda/nodejs:20` to be sure).

If you ever need to update these, unzip these files, add any necessary binaries
to it, and then zip them back up again.

The binaries contained in these files were downloaded from an EC2 instance
running Amazon Linux 2023.

N.B:

- Make sure the binaries are copied from a version of Amazon Linux that matches
  the Lambda Runtime version that is being used, see here:
  <https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html>.
- Make sure that the file structure in the ZIP file does not contain an extra
  directory, but looks like:
  - `gpg`
  - `lib/libgcrypt.so.X`
  - etc.
- `gpg` is probably linked against the major version dependencies only, so it will
  depend on `libgcrypt.so.8` (and not `libgcrypt.so.8.4.1`). Confirm with `ldd` and
  rename the files if necessary.

# Potential update procedure

```shell
host$ exec docker run --net=host \
    --rm -it \
    -v $HOME:$HOME -w $PWD \
    public.ecr.aws/amazonlinux/amazonlinux:2023

# Replace 'gnupg2-minimal' with 'gnupg2', copy gpg-agent out to the current directory
container$ yum install gnupg2 -y --allowerasing
container$ cp /usr/bin/gpg-agent .

# Install openssl, copy CLI out
container$ yum install -y openssl
container$ cp /usr/bin/openssl .
```