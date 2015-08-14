#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ "$#" -le 0 ];  then
    cat $DIR/../contrib/ssh_config
    exit
fi

ssh -F $DIR/../contrib/ssh_config $@
