# Use a NodeJS 20.x runtime
FROM public.ecr.aws/lambda/nodejs:20-x86_64

ARG FUN_SRC_DIR

# install openssel
RUN dnf install -y openssl
ENV LD_LIBRARY_PATH=""
RUN openssl version

# remove gnupg2-minimal pacakge, install gnupg2-full package, and then start the gpg-agent
RUN rpm -e gnupg2-minimal --nodeps && dnf -y install gnupg2-full && gpg-agent --daemon

# copy lambda function source code  to LAMBDA_TASK_ROOT directory
COPY bin/${FUN_SRC_DIR}/* /var/task/

# Set the CMD to the function handler
CMD [ "index.handler" ]