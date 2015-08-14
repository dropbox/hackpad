#!/bin/bash

apt-get install runit
cp -R /home/ubuntu/pad/contrib/testing/jenkins/runit /etc/sv/jenkins
ln -s /etc/sv/jenkins /etc/service/jenkins

echo "sv up jenkins"
