#!/bin/bash
exec 2>&1
ulimit -n 16000
cd /home/ubuntu/pad
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export LANGUAGE=en_US.UTF-8
exec chpst -ujenkins contrib/testing/jenkins/run.sh
