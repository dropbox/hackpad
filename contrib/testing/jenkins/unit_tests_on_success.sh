#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_SUCCESS_MESSAGE="All unit tests are passing!"
# do nothing for now, let the screenshot job handle the hipchat messages
#curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins&color=green" --data-urlencode "message=${HIPCHAT_SUCCESS_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY
