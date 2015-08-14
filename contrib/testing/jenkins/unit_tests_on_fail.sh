#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_FAIL_MESSAGE="Aww snap, a unit test is failing! <a href='${BUILD_URL}parsed_console/'>Have a look</a>"
curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins&color=red" --data-urlencode "message=${HIPCHAT_FAIL_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY
