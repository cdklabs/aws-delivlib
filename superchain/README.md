# Superchain

This docker image includes the following tools:

 - [Node.js 8.11.0](https://nodejs.org/download/release/v8.11.0/)
 - [Java OpenJDK 8](http://openjdk.java.net/install/)
 - [.NET Core 2.0](https://www.microsoft.com/net/download)
 - [Python 3.6.5](https://www.python.org/downloads/release/python-365/)
 - [Ruby 2.5.1](https://www.ruby-lang.org/en/news/2018/03/28/ruby-2-5-1-released/)


## Local Builds

You can use this image to build projects locally by following these instructions (first build will take some time):

```console
$ git clone git@github.com:awslabs/aws-delivlib.git
$ cd aws-delivlib/superchain
$ docker build -t superchain .
```

Now, go to your project directory and run:

```console
$ docker run --net=host -it -v $PWD:$PWD -w $PWD superchain
```

This will get you into a shell inside your container that is mapped to your local file system. Notice that any external symlinks _wont work_.

Now you can run your build scripts.
