#!/bin/bash

################################################################################
#
# Copyright (c) 2010 penSec.IT UG (haftungsbeschränkt)
#        http://www.pensec.it
#        mail@pensec.it
# Copyright (c) 2010 Egil Möller <egil.moller@piratpartiet.se>
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not
# use this file except in compliance with the License. You may obtain a copy of
# the License at
#
#        http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations under
# the License.
#
################################################################################

## Change the following lines to fit your development environment.

# These lines assume you installed Scala via Homebrew.
export SCALA_HOME="/usr/local/Cellar/scala/2.11.7"
export SCALA="$SCALA_HOME/bin/scala"
export SCALA_LIBRARY_JAR="$SCALA_HOME/libexec/lib/scala-library.jar"

export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk1.7.0_45.jdk/Contents/Home"
export JAVA="/usr/bin/java"

## The following lines should not need changing.

export JAVA_OPTS="-Xbootclasspath/p:../infrastructure/lib/rhino-js-1.7r3.jar:$SCALA_LIBRARY_JAR"
export MYSQL_CONNECTOR_JAR="$PWD/lib/mysql-connector-java-5.1.34-bin.jar"
export PATH="$JAVA_HOME/bin:$SCALA_HOME/bin:$PATH"

if ! [ -e "$MYSQL_CONNECTOR_JAR" ]; then
        echo "MySql Connector jar '$MYSQL_CONNECTOR_JAR' not found - Download it here: http://dev.mysql.com/downloads/connector/j/3.1.html"
        exit 1
fi

if ! [ -e "$SCALA_LIBRARY_JAR" ]; then
        echo "Scala Library cannot be found '$SCALA_LIBRARY_JAR' not found - Download it here: http://www.scala-lang.org/"
        exit 1
fi

if ! [ -e "$JAVA" ]; then
        echo "Java cannot be found '$JAVA' not found - Download it here: http://openjdk.java.net/"
        exit 1
fi
