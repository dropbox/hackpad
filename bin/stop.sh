#!/bin/bash
# requires bash 3

TEST_STRING=java

###
# Test if the etherpad instance is alive by checking for
# the process in etherpad/data/etherpad.pid
#
# Use that PID to see if there are any processes running
# and if the command of that process matches $TEST_STRING
#
# If it matches kill the $PID,
# wait and see if the process ended.
#
# Exits 0 on success, 1 on failure

ETHERPADDIR="$(cd "$(dirname "$0")/.."; pwd)"
PID_FILE="${ETHERPADDIR}/etherpad/data/etherpad.pid"

PID=`cat ${PID_FILE}`
RUNNING_CMD="ps -o pid,ruser,ucmd --no-headers -p ${PID}"

function check_if_alive_by_pid {
	result=`ps -o pid,ruser,ucmd --no-headers -p ${1}`
	if [[ "${result}" =~ "${TEST_STRING}" ]] ; then
		return 0
	else
		return 1
	fi
}

i=0
while [ $i -le 10 ] ; do
	check_if_alive_by_pid $PID
	if [[ $? -eq 0 ]] ; then
		kill -9 $PID
		sleep 5
	else
		exit 0
	fi

	i=$(( $i + 1 ))
done

# Should only get here if we've tried restarting the
# Etherpad process 10 times unsuccessfully
exit 1
