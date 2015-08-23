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

mkdir -p data/appjet

# JVM heap memory limit (actually reserved during startup)
MXRAM="4G"
# maximum thread count for etherpad (should be roughly memory in MB / 4)
MAXTHREADS="2048"

if [ -x "/usr/bin/perl" ]; then
	if [ -e "/proc/meminfo" ]; then
	# compute the MXRAM parameter:
	# default it to half of the usable real free memory,
	# but at least 100M and up to 1024M
	# TODO: this should be rewritten in awk to always work (awk is part of coreutils, perl is not)
	MXRAM=$(cat /proc/meminfo | perl -ne '
		BEGIN {
			$free = 0;
			$buffers = 0;
			$cached = 0
		};

		if (m/^MemFree:\s*(\d+)/)
			{ $free = $1/1024 };
		if (m/^Buffers:\s*(\d+)/)
			{ $buffers = $1/1024 };
		if (m/^Cached:\s*(\d+)/)
			{ $cached = $1/1024 };

		END {
			$usable_free = ($free + $buffers + $cached)/2;
			$usable_free = 100 if ($usable_free < 100);
#			$usable_free = 1024 if ($usable_free > 1024);
			print int($usable_free)."M\n"
		};')

	MAXTHREADS=$(echo "$MXRAM" | perl -ne '
			s/[^\d]//;
			$maxthreads = int($_/6);
			if ($maxthreads < 5)
				{ $maxthreads = 5 }
			print $maxthreads;
		')
	fi
fi

if [ ! -z $1 ]; then
    if [ ! '-' = `echo $1 | head -c 1` ]; then
        MXRAM="$1";
        shift;
    fi
fi

CP="appjet-eth-dev.jar:data"
for f in lib/*.jar; do
    CP="$CP:$f"
done

if [ -z "$JAVA" ]; then
    JAVA=java
fi

# etherpad properties file
cfg_file=./etc/etherpad.local.properties
if [ ! -f $cfg_file ]; then
  cfg_file=./etc/etherpad.localdev-default.properties
fi
if [[ $1 == "--cfg" ]]; then
  cfg_file=${2}
  shift;
  shift;
fi

echo "Maximum ram: $MXRAM"
echo "Maximum thread count: $MAXTHREADS"

echo "Using config file: ${cfg_file}"

exec $JAVA -classpath $CP \
    -server \
    -Xmx${MXRAM} \
    -Xms${MXRAM} \
    -XX:NewSize=768m \
    -XX:PermSize=256m \
    -XX:MaxPermSize=512m \
    -Djava.awt.headless=true \
    -Djava.util.logging.config.file=../infrastructure/lib/logging.properties \
    -XX:MaxGCPauseMillis=500 \
    -XX:+UseConcMarkSweepGC \
    -XX:+UseParNewGC \
    -XX:+PrintHeapAtGC \
    -XX:+CMSIncrementalMode \
    -XX:+CMSClassUnloadingEnabled \
    -XX:CMSIncrementalSafetyFactor=50 \
    -XX:+PrintGCDetails \
    -XX:+PrintGCTimeStamps \
    -XX:OnOutOfMemoryError="killall -9 java" \
    -Xloggc:./data/logs/backend/jvm-gc.log \
    -Dappjet.jmxremote=true \
    -Djavax.net.ssl.trustStore=./etc/cacerts-rds \
    -Djavax.net.ssl.trustStorePassword=changeit \
    $JAVA_OPTS \
    net.appjet.oui.main \
    --configFile=${cfg_file} \
    --maxThreads=${MAXTHREADS}
    "$@"

