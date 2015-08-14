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

if [ -z "$JAR" ]; then
    JAR=jar
else
    echo "using JAR $JAR..."
fi

# rm old versions of mysql jar copied from lib -> infrastructure/lib
rm -f lib/mysql-connector-java-*-bin.jar
# copy current version of mysql jar to infrastructure/lib
cp ${MYSQL_CONNECTOR_JAR} lib/

source bin/compilecache.sh

if [ "$1" == "clearcache" ]; then
    echo "CLEARING BUILD CACHE"
    rm -rf buildcache
    shift;
fi

TMPSTORE=/tmp/ajbuild-tmpstore-`date +%s`

JARFILES=`echo $SCALA_LIBRARY_JAR lib/*.jar lib/*.war lib/manifest`
function genjar {
    echo "unzipping JARs..."
    pushd $1 >> /dev/null
    $JAR xf $SCALA_LIBRARY_JAR
    rm -rf META-INF WEB-INF

    for a in ../../lib/*.war; do
    $JAR xf $a
    rm -rf META-INF/{MANIFEST.MF,NOTICE{,.txt},LICENSE{,.txt},INDEX.LIST,SUN_MICR.{RSA,SF},maven}
    done

    for a in ../../lib/*.jar WEB-INF/lib/*.jar; do
	$JAR xf $a
	rm -rf META-INF/{MANIFEST.MF,NOTICE{,.txt},LICENSE{,.txt},INDEX.LIST,SUN_MICR.{RSA,SF},maven}
    done

    rm -rf WEB-INF

    echo "making cached JAR...."
    $JAR -cfm appjet.jar ../../lib/manifest .
    mv appjet.jar /tmp/appjet.jar
    rm -rf *
    mv /tmp/appjet.jar ./

    popd >> /dev/null
}
cacheonfiles JAR "$JARFILES" genjar 1

echo "compiling..."
bin/comp.sh $@

pushd build >> /dev/null

echo "copying cached JAR..."
cp ../buildcache/JAR/appjet.jar ./

echo "making JAR..."
mv appjet.jar /tmp/appjet.jar
$JAR -uf /tmp/appjet.jar . #META-INF com javax org net uk v scala dojox
mv /tmp/appjet.jar ./

echo "cleaning up..."
rm -rf $TMPSTORE

popd >> /dev/null

echo "done."
