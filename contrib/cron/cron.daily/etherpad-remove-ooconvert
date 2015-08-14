#!/bin/sh
PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH

# Clears out all ooconvert-* files that are more than 24 hours old
find /tmp -daystart -mtime +0 -name "ooconvert-*" | xargs rm
