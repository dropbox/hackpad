#!/bin/bash
set -e

HACKPAD_SRC="/etc/hackpad/src"

if [ "$1" = 'hackpad' ]; then

	if [ ! -d "$HACKPAD_SRC" ]; then
		echo "The directory $HACKPAD_SRC doesn't exist."
		echo "Either your docker image is broken (rebuild from scratch if so) or you're running this script on the host machine and should stop it."
		exit 1
	fi

	cd "$HACKPAD_SRC"

	if [ ! -f "$HACKPAD_SRC/README.md" ]; then
		echo "I can't find any hackpad source files. Did you forget to mount the volume?"
		echo "[insert instructions here]"
		exit 1
	fi

	echo "-->Editing configuration files"

	sed 's:^export SCALA_HOME=".*$:export SCALA_HOME="/usr/share/java":' -i '' bin/exports.sh
	sed 's:^export SCALA_LIBRARY_JAR=".*$:export SCALA_LIBRARY_JAR="$SCALA_HOME/scala-library.jar":' -i '' bin/exports.sh
	sed 's:^export JAVA_HOME=".*$:export JAVA_HOME="/usr/share/java":' -i '' bin/exports.sh

	cp etherpad/etc/etherpad.localdev-default.properties etherpad/etc/etherpad.local.properties
	sed 's:__email_addresses_with_admin_access__:admin@localhost.info:' -i '' etherpad/etc/etherpad.local.properties

	echo "-->Running build"

	./bin/build.sh

	echo "-->Starting mysql"
	service mysql restart

	echo "-->Creating database"
	./contrib/scripts/setup-mysql-db.sh -p ""


	echo 
	echo "Starting server. A fake admin account has been created, use admin@localhost.info"
	echo

	./bin/run.sh

elif [[  "$1" = 'server' ]]; then
	echo 
	echo "Starting server."
	echo

	./bin/run.sh

fi

exec "$@"