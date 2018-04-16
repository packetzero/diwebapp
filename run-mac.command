#!/bin/sh
cd `dirname $0`
export PORT=8080
npm install && node generator/service.js


