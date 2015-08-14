#!/bin/bash

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

CP_CMD="cp -R -u"
if [ `uname` == "Darwin" ]; then
	CP_CMD="/bin/cp -R -n"
elif  [ `uname` == "FreeBSD" ]; then
	CP_CMD="/bin/cp -R -n"
elif [ `uname` == "SunOS" ]; then
	CP_CMD="cp -R" #Solaris cp does not have '-u'
fi

function cacheonfiles {
	NAME=$1; FILES=$2; FUNC=$3; NOCOPY=1;
	if [ -z "$4" ]; then
		NOCOPY=0
	fi
	REBUILD=0
	BPATH=buildcache/$NAME
	FILETEST=$BPATH/t
	if [ ! -f $FILETEST ]; then
		REBUILD=1
	else
		for a in $FILES; do
			if [ $FILETEST -ot $a ]; then
				echo $a has changed, rebuilding $NAME
				REBUILD=1
			fi
		done
	fi
	if [ $REBUILD -eq 1 ]; then
		if [ -d $BPATH ]; then
			rm -rf $BPATH
		fi
		mkdir -p $BPATH
		$FUNC $BPATH
		pushd $BPATH >> /dev/null
		touch t
		popd >> /dev/null
	else
		echo using cached $NAME...
	fi
	if [ $NOCOPY -ne 1 ]; then
		for a in $BPATH/*; do
			if [ -d $a ]; then
				$CP_CMD $a build/
			elif [ -f $a ]; then
				cp $a build/
			else
				echo unknown file type $a
				exit 1
			fi
		done
	fi
}
