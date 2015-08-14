#!/bin/bash
REPO_ROOT=$(git rev-parse --show-toplevel)

# List all the machine if no destination specified
if [ "$#" -eq 0 ];  then
    cat $REPO_ROOT/contrib/ssh_config | grep -v "User " | grep -v IdentityFile  
    echo
    echo "$0 destination [branch(default is master)] [-f]"
    echo
    exit
fi

# Grep for the host, user and key to use 
host=`grep -A 1 ".*Host\\s\+$1$" $REPO_ROOT/contrib/ssh_config | grep HostName | awk '{print $2}'`
identity=`grep -A 4 ".*Host\\s\+$1$" $REPO_ROOT/contrib/ssh_config | grep Identity| awk '{print $2}'`
user=`grep -A 4 ".*Host\\s\+$1$" $REPO_ROOT/contrib/ssh_config | grep User | awk '{print $2}'`
eval identity_absolute=$identity

# Load the key
ssh-add $identity_absolute > /dev/null 2>&1

# Announce what we're doing - give a grace period
echo "Pushing ${2:-master} to $1"
for i in `seq 1 5`; do
  printf .
  sleep 1
done

echo

# Ensure we're on the branch we say we want pushed
git branch | grep "* ${2:-master}" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo
  echo "You're asking to push ${2:-master} but you have a different branch checked out!"
  echo
  exit
fi 
 
# Ensure we're in sync with origin (hpush destination master -f) to override
if [ "$3" != "-f" ]; then
  git push origin ${2:-master}
  if [ $? -ne 0 ]; then
    echo
    echo "Oops.  Please push to origin first!"
    echo
    exit
  fi
fi

# Manually handle pushing to nginx
if [ "$1" == "nginx" ];  then
  # backup old config
  scp $user@$host:~/pad/contrib/nginx.conf /tmp/nginx.conf.old
  
  # push new config
  echo scp $REPO_ROOT/contrib/nginx.conf $user@$host:/etc/nginx/nginx.conf
  scp $REPO_ROOT/contrib/nginx.conf $user@$host:~/pad/contrib/nginx.conf

  # push error pages
  hssh nginx mkdir -p /home/ubuntu/pad/etherpad/src/static
  scp $REPO_ROOT/etherpad/src/static/502.html $user@$host:~/pad/etherpad/src/static/
   
  # confirm the diff
  echo "Configuration pushed to nginx. Saved old config to /tmp/nginx.conf.old. Diff is:"
  diff /tmp/nginx.conf.old $REPO_ROOT/contrib/nginx.conf

  echo "Don't forget to reload the config (sudo nginx -s reload)"
  echo "Also -- make sure the configuration is the same between the Hackpad and Composer repos!"
  exit
fi

# Push
git push ${3} ssh://$user@$host/home/$user/pad ${2:-master}
if [ $? -ne 0 ]; then
  exit
fi
