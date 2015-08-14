#! /bin/bash
HIPCHAT_ROOM="hackpad"
HIPCHAT_SUCCESS_MESSAGE="All unit and screenshot tests are passing! Awesomesauce."
curl --data-urlencode "room_id=${HIPCHAT_ROOM}" -d "from=Jenkins&color=green" --data-urlencode "message=${HIPCHAT_SUCCESS_MESSAGE}" https://api.hipchat.com/v1/rooms/message?auth_token=$HIPCHAT_API_KEY
