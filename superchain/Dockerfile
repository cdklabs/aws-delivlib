# Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License.
# A copy of the License is located at
#
#    http://aws.amazon.com/asl/
#
# or in the "license" file accompanying this file.
# This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied.
# See the License for the specific language governing permissions and limitations under the License.
#

FROM ubuntu:14.04.5

ENV DOCKER_BUCKET="download.docker.com" \
    DOCKER_VERSION="18.09.0" \
    DOCKER_CHANNEL="stable" \
    DOCKER_SHA256="08795696e852328d66753963249f4396af2295a7fe2847b839f7102e25e47cb9" \
    DIND_COMMIT="3b5fac462d21ca164b3778647420016315289034" \
    DOCKER_COMPOSE_VERSION="1.23.2" \
    GITVERSION_VERSION="3.6.5"

# Install git, SSH, and other utilities
RUN set -ex \
    && echo 'Acquire::CompressionTypes::Order:: "gz";' > /etc/apt/apt.conf.d/99use-gzip-compression \
    && apt-get update \
    && apt install -y apt-transport-https \
    && apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF \
    && echo "deb https://download.mono-project.com/repo/ubuntu stable-trusty main" | tee /etc/apt/sources.list.d/mono-official-stable.list \
    && apt-get update \
    && apt-get install software-properties-common -y --no-install-recommends \
    && apt-add-repository ppa:git-core/ppa \
    && apt-get update \
    && apt-get install git=1:2.* -y --no-install-recommends \
    && git version \
    && apt-get install -y --no-install-recommends openssh-client=1:6.6* \
    && mkdir ~/.ssh \
    && touch ~/.ssh/known_hosts \
    && ssh-keyscan -t rsa,dsa -H github.com >> ~/.ssh/known_hosts \
    && ssh-keyscan -t rsa,dsa -H bitbucket.org >> ~/.ssh/known_hosts \
    && chmod 600 ~/.ssh/known_hosts \
    && apt-get install -y --no-install-recommends \
       wget=1.15-* python3=3.4.* python3.4-dev=3.4.* fakeroot=1.20-* ca-certificates jq \
       tar=1.27.* gzip=1.6-* zip=3.0-* autoconf=2.69-* automake=1:1.14.* \
       bzip2=1.0.* file=1:5.14-* g++=4:4.8.* gcc=4:4.8.* imagemagick=8:6.7.* \
       libbz2-dev=1.0.* libc6-dev=2.19-* libcurl4-openssl-dev=7.35.* libdb-dev=1:5.3.* \
       libevent-dev=2.0.* libffi-dev=3.1~* libgeoip-dev=1.6.* libglib2.0-dev=2.40.* \
       libjpeg-dev=8c-* libkrb5-dev=1.12+* liblzma-dev=5.1.* \
       libmagickcore-dev=8:6.7.* libmagickwand-dev=8:6.7.* libmysqlclient-dev=5.5.* \
       libncurses5-dev=5.9+* libpng12-dev=1.2.* libpq-dev=9.3.* libreadline-dev=6.3-* \
       libsqlite3-dev=3.8.* libssl-dev=1.0.* libtool=2.4.* libwebp-dev=0.4.* \
       libxml2-dev=2.9.* libxslt1-dev=1.1.* libyaml-dev=0.1.* make=3.81-* \
       patch=2.7.* xz-utils=5.1.* zlib1g-dev=1:1.2.* unzip=6.0-* curl=7.35.* \
       e2fsprogs=1.42.* iptables=1.4.* xfsprogs=3.1.* xz-utils=5.1.* \
       mono-devel=5.* less=458-* groff=1.22.* liberror-perl=0.17-* \
       asciidoc=8.6.* build-essential=11.* bzr=2.6.* cvs=2:1.12.* cvsps=2.1-* docbook-xml=4.5-* docbook-xsl=1.78.* dpkg-dev=1.17.* \
       libdbd-sqlite3-perl=1.40-* libdbi-perl=1.630-* libdpkg-perl=1.17.* libhttp-date-perl=6.02-* \
       libio-pty-perl=1:1.08-* libserf-1-1=1.3.* libsvn-perl=1.8.* libsvn1=1.8.* libtcl8.6=8.6.* libtimedate-perl=2.3000-* \
       libunistring0=0.9.* libxml2-utils=2.9.* libyaml-perl=0.84-* python-bzrlib=2.6.* python-configobj=4.7.* \
       sgml-base=1.26+* sgml-data=2.0.* subversion=1.8.* tcl=8.6.* tcl8.6=8.6.* xml-core=0.13+* xmlto=0.0.* xsltproc=1.1.* python3-pip \
       tk=8.6.* gettext=0.18.* gettext-base=0.18.* libapr1=1.5.* libaprutil1=1.5.* libasprintf0c2=0.18.*  \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Download and set up GitVersion
RUN set -ex \
    && wget "https://github.com/GitTools/GitVersion/releases/download/v${GITVERSION_VERSION}/GitVersion_${GITVERSION_VERSION}.zip" -O /tmp/GitVersion_${GITVERSION_VERSION}.zip \
    && mkdir -p /usr/local/GitVersion_${GITVERSION_VERSION} \
    && unzip /tmp/GitVersion_${GITVERSION_VERSION}.zip -d /usr/local/GitVersion_${GITVERSION_VERSION} \
    && rm /tmp/GitVersion_${GITVERSION_VERSION}.zip \
    && echo "mono /usr/local/GitVersion_${GITVERSION_VERSION}/GitVersion.exe \$@" >> /usr/local/bin/gitversion \
    && chmod +x /usr/local/bin/gitversion

# Install Docker
RUN set -ex \
    && curl -fSL "https://${DOCKER_BUCKET}/linux/static/${DOCKER_CHANNEL}/x86_64/docker-${DOCKER_VERSION}.tgz" -o docker.tgz \
    && echo "${DOCKER_SHA256} *docker.tgz" | sha256sum -c - \
    && tar --extract --file docker.tgz --strip-components 1  --directory /usr/local/bin/ \
    && rm docker.tgz \
    && docker -v \
# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
    && addgroup dockremap \
    && useradd -g dockremap dockremap \
    && echo 'dockremap:165536:65536' >> /etc/subuid \
    && echo 'dockremap:165536:65536' >> /etc/subgid \
    && wget "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind" -O /usr/local/bin/dind \
    && curl -L https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-Linux-x86_64 > /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/dind /usr/local/bin/docker-compose \
# Ensure docker-compose works
    && docker-compose version

VOLUME /var/lib/docker

# Configure SSH
COPY ssh_config /root/.ssh/config

COPY dockerd-entrypoint.sh /usr/local/bin/

### NodeJS -- https://github.com/aws/aws-codebuild-docker-images/tree/master/ubuntu/nodejs/8.11.0

ENV NODE_VERSION="8.11.0"

# gpg keys listed at https://github.com/nodejs/node#release-team
COPY node-release-keys.asc /tmp/node-release-keys.asc
RUN set -ex \
    && gpg --import < /tmp/node-release-keys.asc \
    && rm /tmp/node-release-keys.asc
RUN set -ex \
    && wget "https://nodejs.org/download/release/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" -O node-v$NODE_VERSION-linux-x64.tar.gz \
    && wget "https://nodejs.org/download/release/v$NODE_VERSION/SHASUMS256.txt.asc" -O SHASUMS256.txt.asc \
    && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \
    && grep " node-v$NODE_VERSION-linux-x64.tar.gz\$" SHASUMS256.txt | sha256sum -c - \
        && tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
        && rm "node-v$NODE_VERSION-linux-x64.tar.gz" SHASUMS256.txt.asc SHASUMS256.txt \
        && ln -s /usr/local/bin/node /usr/local/bin/nodejs \
        && rm -fr /var/lib/apt/lists/* /tmp/* /var/tmp/* \
        && npm -g install npm@~6.8.0

RUN npm set unsafe-perm true

### Java 8 -- https://github.com/aws/aws-codebuild-docker-images/blob/master/ubuntu/java/openjdk-8/Dockerfile
ENV JAVA_VERSION=8 \
    JAVA_HOME="/usr/lib/jvm/java-8-openjdk-amd64" \
    JDK_HOME="/usr/lib/jvm/java-8-openjdk-amd64" \
    JRE_HOME="/usr/lib/jvm/java-8-openjdk-amd64" \
    ANT_VERSION=1.10.3 \
    MAVEN_HOME="/opt/maven" \
    MAVEN_VERSION=3.5.4 \
    MAVEN_CONFIG="/root/.m2" \
    GRADLE_VERSION=4.2.1 \
    PROPERTIES_COMMON_VERSION=0.92.37.8 \
    PYTHON_TOOL_VERSION="3.3-*" \
    PYTHON_WHEEL_VERSION="0.24.*" \
    JDK_VERSION="8u171-b11-2~14.04" \
    ANT_DOWNLOAD_SHA512="73f2193700b1d1e32eedf25fab1009e2a98fb2f6425413f5c9fa1b0f2f9f49f59cb8ed3f04931c808ae022a64ecfa2619e5fb77643fea6dbc29721e489eb3a07" \
    MAVEN_DOWNLOAD_SHA1="22cac91b3557586bb1eba326f2f7727543ff15e3" \
    GRADLE_DOWNLOAD_SHA256="b551cc04f2ca51c78dd14edb060621f0e5439bdfafa6fd167032a09ac708fbc0"

RUN set -ex \
    && apt-get update \
    && apt-get install -y software-properties-common=$PROPERTIES_COMMON_VERSION \
    && add-apt-repository ppa:openjdk-r/ppa \
    && apt-get update \
    && apt-get install -y python-setuptools=$PYTHON_TOOL_VERSION \
    && apt-get install -y python-wheel=$PYTHON_WHEEL_VERSION \
    # Install OpenJDK 8
    && apt-get install -y openjdk-${JAVA_VERSION}-jdk=$JDK_VERSION \
    && apt-get install -y --no-install-recommends ca-certificates-java \
    && apt-get clean \
    # Ensure Java cacerts symlink points to valid location
    && update-ca-certificates -f \
    # Install Ant
    && curl -LSso /var/tmp/apache-ant-$ANT_VERSION-bin.tar.gz https://archive.apache.org/dist/ant/binaries/apache-ant-$ANT_VERSION-bin.tar.gz  \
    && echo "$ANT_DOWNLOAD_SHA512 /var/tmp/apache-ant-$ANT_VERSION-bin.tar.gz" | sha512sum -c - \
    && tar -xzf /var/tmp/apache-ant-$ANT_VERSION-bin.tar.gz -C /opt \
    && update-alternatives --install /usr/bin/ant ant /opt/apache-ant-$ANT_VERSION/bin/ant 10000 \
    # Install Maven
    && mkdir -p $MAVEN_HOME \
    && curl -LSso /var/tmp/apache-maven-$MAVEN_VERSION-bin.tar.gz https://apache.org/dist/maven/maven-3/$MAVEN_VERSION/binaries/apache-maven-$MAVEN_VERSION-bin.tar.gz \
    && echo "$MAVEN_DOWNLOAD_SHA1 /var/tmp/apache-maven-$MAVEN_VERSION-bin.tar.gz" | sha1sum -c - \
    && tar xzvf /var/tmp/apache-maven-$MAVEN_VERSION-bin.tar.gz -C $MAVEN_HOME --strip-components=1 \
    && update-alternatives --install /usr/bin/mvn mvn /opt/maven/bin/mvn 10000 \
    && mkdir -p $MAVEN_CONFIG \
    # Install Gradle
    && curl -LSso /var/tmp/gradle-$GRADLE_VERSION-bin.zip https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip \
    && echo "$GRADLE_DOWNLOAD_SHA256 /var/tmp/gradle-$GRADLE_VERSION-bin.zip" | sha256sum -c - \
    && unzip /var/tmp/gradle-$GRADLE_VERSION-bin.zip -d /opt \
    && update-alternatives --install /usr/local/bin/gradle gradle /opt/gradle-$GRADLE_VERSION/bin/gradle 10000 \
    # Cleanup
    && rm -fr /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && apt-get clean

COPY m2-settings.xml $MAVEN_CONFIG/settings.xml

### .NET CLI

# Install .NET CLI dependencies
RUN set -ex \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        libc6=2.19-* \
        libcurl3=7.35.* \
        libgcc1=1:4.9.* \
        libgssapi-krb5-2=1.12* \
        libicu52=52.1-* \
        liblttng-ust0=2.4.* \
        libssl1.0.0=1.0.* \
        libunwind8=1.1-* \
        libuuid1=2.20.* \
        zlib1g=1:1.2.* \
        software-properties-common=0.92.* \
    && add-apt-repository ppa:ubuntu-toolchain-r/test -y \
    && apt-get update \
    && apt-get install -y libstdc++6\
    && rm -rf /var/lib/apt/lists/*



# Install .NET Core SDK
ENV DOTNET_SDK_VERSION 2.2.202
ENV DOTNET_SDK_DOWNLOAD_URL https://dotnetcli.blob.core.windows.net/dotnet/Sdk/$DOTNET_SDK_VERSION/dotnet-sdk-$DOTNET_SDK_VERSION-linux-x64.tar.gz
ENV DOTNET_SDK_DOWNLOAD_SHA 14F5C0E6FBB874A882334E0D500E494B01D7F363028E72DB58DFFF6DB43C54670533539DCF6B8F50A97CE1E099119A8286CE84E193B361D65B1FD8C7DFFCE63D

RUN set -ex \
    && curl -SL $DOTNET_SDK_DOWNLOAD_URL --output dotnet.tar.gz \
    && echo "$DOTNET_SDK_DOWNLOAD_SHA dotnet.tar.gz" | sha512sum -c - \
    && mkdir -p /usr/share/dotnet \
    && tar -zxf dotnet.tar.gz -C /usr/share/dotnet \
    && rm dotnet.tar.gz \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

# Add .NET Core Global Tools install folder to PATH
ENV PATH "~/.dotnet/tools/:$PATH"

# Trigger the population of the local package cache
ENV NUGET_XMLDOC_MODE skip
RUN set -ex \
    && mkdir warmup \
    && cd warmup \
    && dotnet new \
    && cd .. \
    && rm -rf warmup \
    && rm -rf /tmp/NuGetScratch

# Install Powershell Core
# See instructions at https://docs.microsoft.com/en-us/powershell/scripting/setup/installing-powershell-core-on-linux
ENV POWERSHELL_VERSION 6.1.0
ENV POWERSHELL_DOWNLOAD_URL https://github.com/PowerShell/PowerShell/releases/download/v6.1.0/powershell-6.1.0-linux-x64.tar.gz
ENV POWERSHELL_DOWNLOAD_SHA 68674CFBA84ABF759C7E10EF6FCD926CBC125D9958E11A1926AF7CF7F604506C

RUN set -ex \
    && curl -SL $POWERSHELL_DOWNLOAD_URL --output powershell.tar.gz \
    && echo "$POWERSHELL_DOWNLOAD_SHA powershell.tar.gz" | sha256sum -c - \
    && mkdir -p /opt/microsoft/powershell/$POWERSHELL_VERSION \
    && tar zxf powershell.tar.gz -C /opt/microsoft/powershell/$POWERSHELL_VERSION \
    && rm powershell.tar.gz \
    && ln -s /opt/microsoft/powershell/$POWERSHELL_VERSION/pwsh /usr/bin/pwsh

### Python 3.6.5 -- https://github.com/aws/aws-codebuild-docker-images/blob/master/ubuntu/python/3.6.5/Dockerfile

ENV PATH="/usr/local/bin:$PATH" \
    GPG_KEY="0D96DF4D4110E5C43FBFB17F2D347EA6AA65421D" \
    PYTHON_VERSION="3.6.5" \
    PYTHON_PIP_VERSION="10.0.0" \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

COPY python-release-keys.asc /tmp/python-release-keys.asc
RUN apt-get update && apt-get install -y --no-install-recommends \
        tcl-dev tk-dev \
    && rm -rf /var/lib/apt/lists/* \
    \
    && wget -O python.tar.xz "https://www.python.org/ftp/python/${PYTHON_VERSION%%[a-z]*}/Python-$PYTHON_VERSION.tar.xz" \
    && wget -O python.tar.xz.asc "https://www.python.org/ftp/python/${PYTHON_VERSION%%[a-z]*}/Python-$PYTHON_VERSION.tar.xz.asc" \
    && export GNUPGHOME="$(mktemp -d)" \
    && gpg --import < /tmp/python-release-keys.asc \
    && rm /tmp/python-release-keys.asc \
    && gpg --batch --verify python.tar.xz.asc python.tar.xz \
    && rm -r "$GNUPGHOME" python.tar.xz.asc \
    && mkdir -p /usr/src/python \
    && tar -xJC /usr/src/python --strip-components=1 -f python.tar.xz \
    && rm python.tar.xz \
    \
    && cd /usr/src/python \
    && ./configure \
        --enable-loadable-sqlite-extensions \
        --enable-shared \
    && make -j$(nproc) \
    && make install \
    && ldconfig \
    \
# explicit path to "pip3" to ensure distribution-provided "pip3" cannot interfere
    && if [ ! -e /usr/local/bin/pip3 ]; then : \
        && wget -O /tmp/get-pip.py 'https://bootstrap.pypa.io/get-pip.py' \
        && python3 /tmp/get-pip.py "pip==$PYTHON_PIP_VERSION" \
        && rm /tmp/get-pip.py \
    ; fi \
# we use "--force-reinstall" for the case where the version of pip we're trying to install is the same as the version bundled with Python
# ("Requirement already up-to-date: pip==8.1.2 in /usr/local/lib/python3.6/site-packages")
# https://github.com/docker-library/python/pull/143#issuecomment-241032683
    && pip3 install --no-cache-dir --upgrade --force-reinstall "pip==$PYTHON_PIP_VERSION" \
        && pip install awscli==1.* boto3 pipenv virtualenv wheel --no-cache-dir \
# then we use "pip list" to ensure we don't have more than one pip version installed
# https://github.com/docker-library/python/pull/100
    && [ "$(pip list |tac|tac| awk -F '[ ()]+' '$1 == "pip" { print $2; exit }')" = "$PYTHON_PIP_VERSION" ] \
    \
    && find /usr/local -depth \
        \( \
            \( -type d -a -name test -o -name tests \) \
            -o \
            \( -type f -a -name '*.pyc' -o -name '*.pyo' \) \
        \) -exec rm -rf '{}' + \
    && apt-get purge -y --auto-remove tcl-dev tk-dev \
    && rm -rf /usr/src/python ~/.cache \
    && cd /usr/local/bin \
    && { [ -e easy_install ] || ln -s easy_install-* easy_install; } \
    && ln -s idle3 idle \
    && ln -s pydoc3 pydoc \
    && ln -s python3 python \
    && ln -s python3-config python-config \
        && rm -fr /var/lib/apt/lists/* /tmp/* /var/tmp/*

### Ruby 2.5.1 - https://github.com/aws/aws-codebuild-docker-images/blob/master/ubuntu/ruby/2.5.1/Dockerfile

ENV RUBY_MAJOR="2.5" \
     RUBY_VERSION="2.5.3" \
     RUBY_DOWNLOAD_SHA256="9828d03852c37c20fa333a0264f2490f07338576734d910ee3fd538c9520846c" \
     RUBYGEMS_VERSION="2.7.7" \
     BUNDLER_VERSION="1.16.6" \
     GEM_HOME="/usr/local/bundle"

 ENV BUNDLE_PATH="$GEM_HOME" \
     BUNDLE_BIN="$GEM_HOME/bin" \
     BUNDLE_SILENCE_ROOT_WARNING=1 \
     BUNDLE_APP_CONFIG="$GEM_HOME"

 ENV PATH $BUNDLE_BIN:$PATH

 RUN mkdir -p /usr/local/etc \
    && { \
            echo 'install: --no-document'; \
            echo 'update: --no-document'; \
        } >> /usr/local/etc/gemrc \
    && apt-get update && apt-get install -y --no-install-recommends \
       bison libgdbm-dev ruby \
    && wget "https://cache.ruby-lang.org/pub/ruby/$RUBY_MAJOR/ruby-$RUBY_VERSION.tar.gz" -O /tmp/ruby.tar.gz \
    && echo "$RUBY_DOWNLOAD_SHA256 /tmp/ruby.tar.gz" | sha256sum -c - \
    && mkdir -p /usr/src/ruby \
    && tar -xzf /tmp/ruby.tar.gz -C /usr/src/ruby --strip-components=1 \
    && cd /usr/src/ruby \
    && { \
            echo '#define ENABLE_PATH_CHECK 0'; \
            echo; \
            cat file.c; \
        } > file.c.new \
    && mv file.c.new file.c \
    && autoconf \
    && ./configure --disable-install-doc \
    && make -j"$(nproc)" \
    && make install \
    && apt-get purge -y --auto-remove bison libgdbm-dev ruby \
    && cd / \
    && rm -r /usr/src/ruby \
    && gem update --system "$RUBYGEMS_VERSION" \
    && gem install bundler --version "$BUNDLER_VERSION" \
    && mkdir -p "$GEM_HOME" "$BUNDLE_BIN" \
    && chmod 777 "$GEM_HOME" "$BUNDLE_BIN" \
    && rm -fr /var/lib/apt/lists/* /tmp/* /var/tmp/*

### Local Tweaking
# Install rsync
RUN set -ex \
    && apt-get update \
    && apt-get -y install rsync

RUN echo 'DOTNET_CLI_TELEMETRY_OPTOUT=1' >> ~/.bashrc

CMD [ "/bin/bash" ]
