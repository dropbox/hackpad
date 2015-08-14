#!/bin/bash -e

#  Copyright 2009 Google Inc.
#  
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  
#       http://www.apache.org/licenses/LICENSE-2.0
#  
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS-IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

source bin/compilecache.sh

rm -rf build
mkdir build

if [ "$1" == "clearcache" ]; then
    echo "CLEARING BUILD CACHE"
    rm -rf buildcache
    mkdir -p buildcache
    shift;
fi

if [ -z "$CC" ]; then
    CC=scalac
fi
echo compiling with \'$CC\'...

CP=`bin/classpath.sh`
CP="build/:${CP}:buildcache/JAR/appjet.jar"

if [ -z "$OBFUSC" ]; then
    OBFUSC=0
else
    echo obfuscation on...
fi

#THRIFTFILES=`echo net.appjet.fancypants/{storage/KeyValueStore,DebugLog,LtpLog}.thrift`
#THRIFTFILES=`find gen-java/net/appjet/fancypants -name '*.java'`
#function genthrift {
#    echo "generating thrift..."
#    rm -rf gen-java
#    for a in $THRIFTFILES; do
#	thrift -java $a
#    done

#    echo "compiling thrift..."
#    CP="${CP}:gen-java/"
#    javac \
#	-classpath $CP \
#	-target 1.5 \
#	-d $1 \
#	$THRIFTFILES
#}
#cacheonfiles thrift "$THRIFTFILES" genthrift

ARGS=$@

COMMONFILES=`find net.appjet.common -name '*.java'`
COMMONSCALAFILES=`find net.appjet.common -name '*.scala'`
function gencommon {
    echo "compiling common..."
    javac \
	-cp $CP \
	-d $1 \
	-target 1.5 \
	-source 1.5 \
	$COMMONFILES
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$COMMONSCALAFILES
}
cacheonfiles common "$COMMONFILES $COMMONSCALAFILES" gencommon

SARSFILES=`find net.appjet.common.sars -name '*.scala'`
function gensars {
    echo "compiling sars..."
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$SARSFILES
}
cacheonfiles sars "$SARSFILES" gensars

CLIFILES=`find net.appjet.common.cli -name '*.scala'`
function gencli {
    echo "compiling cli..."
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$CLIFILES
    echo "done with cli"
}
cacheonfiles cli "$CLIFILES" gencli

BODYLOCKFILES=`find net.appjet.bodylock -name '*.scala'`
function genbodylock {
    echo "compiling rhino abstraction..."
    $CC \
	-classpath build:$CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$BODYLOCKFILES
}
cacheonfiles bodylock "$BODYLOCKFILES" genbodylock

APPSERVERFILES=`find net.appjet.oui -name '*.scala'`
APPSERVERJAVAFILES=`find net.appjet.oui -name '*.java'`
function genappserver {
    echo "compiling appserver source..."
    javac \
	-cp $CP \
	-d $1 \
	-target 1.5 \
	-source 1.5 \
	$APPSERVERJAVAFILES
    $CC \
	-classpath $CP:$1 \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$APPSERVERFILES
}
cacheonfiles appserver "$APPSERVERFILES $APPSERVERJAVAFILES" genappserver

AJSTDLIBFILES=`find net.appjet.ajstdlib -name '*.scala'`
AJSTDLIBJAVAFILES=`find net.appjet.ajstdlib -name '*.java'`
function genajstdlib {
    echo "compiling ajstdlib..."
    mkdir -p $1
    if [ ! -z "$AJSTDLIBJAVAFILES" ]; then
	javac \
	    -cp $CP \
	    -d $1 \
	    -target 1.5 \
	    -source 1.5 \
	    $AJSTDLIBJAVAFILES
    fi
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$AJSTDLIBFILES
}
cacheonfiles ajstdlib "$AJSTDLIBFILES $AJSTDLIBJAVAFILES" genajstdlib

EPFILES=`find com.etherpad -name '*.scala'`
EPJAVAFILES=`find com.etherpad -name '*.java'`
function genetherpad {
    echo "compilng etherpad..."
    if [ ! -z "$EPJAVAFILES" ]; then
	javac \
	    -cp $CP \
	    -d $1 \
	    -target 1.5 \
	    -source 1.5 \
	    $EPJAVAFILES
    fi
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$EPFILES
}
cacheonfiles etherpad "$EPFILES $EPJAVAFILES" genetherpad

OOSERVICEFILES=`find com.etherpad.openofficeservice -name '*.scala'`
function genooservice {
    echo "compiling ooservice..."
    $CC \
	-classpath $CP \
	-d $1 \
	-target:jvm-1.5 \
	$ARGS \
	$OOSERVICEFILES
}
cacheonfiles ooservice "$OOSERVICEFILES" genooservice

echo "copying files..."
cp net.appjet.ajstdlib/streaming-client.js build/net/appjet/ajstdlib/
if [ $OBFUSC ] ; then
    echo obfuscating...
    scala -classpath $CP:. net.appjet.bodylock.compressor \
	build/net/appjet/ajstdlib/streaming-client.js
fi

cp net.appjet.ajstdlib/streaming-iframe.html build/net/appjet/ajstdlib/
mkdir -p build/net/appjet/ajstdlib/modules

echo "building javascript classfiles..."
scala -classpath $CP net.appjet.bodylock.Compiler \
    -destination=build/net/appjet/ajstdlib/ \
    -cutPrefix=framework-src \
    `find framework-src -name '*.js'`

echo "done."
