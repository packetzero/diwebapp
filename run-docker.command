#!/bin/bash
DIR=`dirname "$0"`
cd $DIR
HOSTPORT=8080
docker run -it --rm --name dinode -p ${HOSTPORT}:80 -v "$PWD":/usr/src/app -w /usr/src/app node:carbon-alpine node generator/service.js
