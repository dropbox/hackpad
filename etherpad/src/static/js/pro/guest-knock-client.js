/*!
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


function knock() {
  $.ajax({
    type: "POST",
    url: "/ep/account/guest/guest-knock",
    cache: false,
    data: {
      padId: clientVars.localPadId,
    },
    success: knockReply,
    error: knockError
  });
}

function knockReply(responseText) {
  //console.log("knockReply: "+responseText);
  if (responseText == "approved") {
    window.location.href = clientVars.padUrl;
  }
  if (responseText == "denied") {
    $("#guest-knock-box").hide();
    $("#guest-knock-denied").show();
  }
  if (responseText == "wait") {
    setTimeout(knock, 1000);
  }
}

function knockError() {
  alert("There was an error requesting access to the pad.  Kindly report this by sending email to support.");
}

$(document).ready(function() {
  knock();
});
