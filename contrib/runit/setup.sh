#!/bin/bash

apt-get install runit
cp -R /home/ubuntu/pad/contrib/runit /etc/sv/hackpad
ln -s /etc/sv/hackpad /etc/service/hackpad

sv down hackpad
echo "sv up hackpad"