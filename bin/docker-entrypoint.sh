#!/bin/bash
set -e

HACKPAD_SRC="/etc/hackpad/src"

if [ "$1" = 'hackpad' ]; then

	if [ ! -d "$HACKPAD_SRC" ]; then
		echo "The directory $HACKPAD_SRC doesn't exist."
		echo "You're probably running this on the host machine and not in the Docker container. Don't do that."
		echo "If this is happening on the Docker container, try building a new image from scratch."
		exit 1
	fi

	cd "$HACKPAD_SRC"

	# sanity check that we see any files at all.
	if [ ! -f "$HACKPAD_SRC/README.md" ]; then
		echo "I can't find any Hackpad source files. Did you forget to mount the volume?"
		echo "e.g., docker run -d -p 9000:9000 -v /path/to/this/repo:/etc/hackpad/src hackpad"
		exit 1
	fi

	echo "-->Editing configuration files"

	sed 's:^export SCALA_HOME=".*$:export SCALA_HOME="/usr/share/java":' -i'' bin/exports.sh
	sed 's:^export SCALA_LIBRARY_JAR=".*$:export SCALA_LIBRARY_JAR="$SCALA_HOME/scala-library.jar":' -i'' bin/exports.sh
	sed 's:^export JAVA_HOME=".*$:export JAVA_HOME="/usr/share/java":' -i'' bin/exports.sh

	cp etherpad/etc/etherpad.localdev-default.properties etherpad/etc/etherpad.local.properties
	sed 's:__email_addresses_with_admin_access__:admin@localhost.info:' -i'' etherpad/etc/etherpad.local.properties

	echo "-->Running build"

	./bin/build.sh

	echo "-->Starting mysql"
	service mysql restart

	echo "-->Creating database"
	./contrib/scripts/setup-mysql-db.sh -p ""


	echo 
	echo "Starting server. The admin account is 'admin@localhost.info'."
	echo

	./bin/run.sh

elif [[  "$1" = 'server' ]]; then
	echo 
	echo "Starting server."
	echo

	./bin/run.sh

fi

exec "$@"