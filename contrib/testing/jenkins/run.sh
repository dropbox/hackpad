#!/bin/bash
. /etc/default/jenkins
export JENKINS_HOME=$JENKINS_HOME
exec $JAVA $JAVA_ARGS -jar $JENKINS_WAR $JENKINS_ARGS

