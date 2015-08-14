#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_MESSAGE="All unit tests are passing! <a href='${BUILD_URL}'>See diff screenshots</a> or <a href='${BUILD_URL}/artifact/broken/'>a list view</a>."
curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins&color=green" --data-urlencode "message=${HIPCHAT_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY
