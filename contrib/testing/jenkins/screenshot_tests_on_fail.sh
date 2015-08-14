#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_FAIL_MESSAGE="All unit tests are passing! However, screenshots are a different story: <a href='${BUILD_URL}'>diffs</a> or <a href='${BUILD_URL}/artifact/broken/'>list view</a>. "
curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins&color=red" --data-urlencode "message=${HIPCHAT_FAIL_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY

