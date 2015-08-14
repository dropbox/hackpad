#! /bin/bash
WAIT_TIME=30
HIPCHAT_ROOM="hackpad"
HIPCHAT_START_MESSAGE="I'm taking over stage to run unit tests in ${WAIT_TIME} seconds. (<a href='${BUILD_URL}stop'>click here to stop me</a>)"

DESTINATION_BRANCH=master

echo "Notifying hipchat of build start"
curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins" --data-urlencode "message=${HIPCHAT_START_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY

echo "Waiting $WAIT_TIME seconds to start"
sleep $WAIT_TIME

echo "Pushing to ${GIT_COMMIT} to stage"
git push stage $GIT_COMMIT:$DESTINATION_BRANCH -f
ssh ubuntu@stage.hackpad.com "cd /home/ubuntu/pad && git checkout ${DESTINATION_BRANCH}"

echo "Starting unit tests on stage..."
curl -k -b ~/cookies.txt https://stage.hackpad.com/ep/unit-tests/run