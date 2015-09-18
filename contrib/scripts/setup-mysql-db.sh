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

MYSQL="mysql"
DATABASE="hackpad"
DB_USERNAME=root
DB_PASSWORD=

PROMPT=true

while [[ $# > 0 ]]
do
key="$1"

case $key in

    -d|--database)
    DATABASE="$2"
    shift # past argument=value
    ;;
    -u|--username)
    DB_USERNAME="$2"
    shift # past argument=value
    ;;
    -p|--password)
    DB_PASSWORD="$2"
    PROMPT=false 
    shift # past argument=value
    ;;
    *)
            # unknown option
    ;;
esac
shift
done


if [ "$PROMPT" == true ]; then
	MYSQL_CMD="${MYSQL} -u ${DB_USERNAME} -p"
else
	if [ -z "$DB_PASSWORD" ]; then

        MYSQL_CMD="${MYSQL} -u ${DB_USERNAME}"
	else
		MYSQL_CMD="${MYSQL} -u ${DB_USERNAME} -p ${DB_PASSWORD}" 
	fi
fi


echo "Creating database ${DATABASE}..."
echo "create database ${DATABASE};" | ${MYSQL_CMD}


echo "Granting priviliges..."
echo "grant all privileges on ${DATABASE}.* to 'hackpad'@'localhost' identified by 'password';" | ${MYSQL_CMD}

echo "Success"
