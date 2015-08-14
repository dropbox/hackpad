#!/bin/sh

### Extracted from Setting up a new EC2 Server

## Update Ubuntu
apt-get update
apt-get dist-upgrade -y

## Replace OpenJDK with Oracle Java 7
add-apt-repository ppa:webupd8team/java -y
apt-get update
apt-get install oracle-java7-installer -y

## Install NTP (time syncronization)
apt-get install ntp -y

## Install Runit (sv command)
apt-get install runit -y

## Tune sysctl.conf
echo "# options added by boot RightScript:
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 1024 65023
net.ipv4.tcp_max_syn_backlog = 10240
net.ipv4.tcp_max_tw_buckets = 400000
net.ipv4.tcp_max_orphans = 60000
net.ipv4.tcp_synack_retries = 3
net.core.somaxconn = 10000
" >> /etc/sysctl.conf

sysctl -p

## Setup Git
apt-get install git -y
git init pad
(cd pad && git config receive.denyCurrentBranch ignore)
(cd pad/.git/hooks && echo -e '#!/bin/sh\ncd ..\nenv -i git reset --hard' > post-receive && chmod +x post-receive)
chown -R ubuntu.ubuntu pad

ln -s /var/log/hackpad ~/logs
ln -s pad/hackpad/data/logs/backend/jvm-gc.log ~/jvm-gc.log

echo Please restart and run contrib/runit/setup.sh

