
$.urlParam = function(name){
  var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
  return results && decodeURIComponent(results[1]) || null;
}


var padfacebook = (function() {
  var cont = $.urlParam("cont");

  function _showFacebookLoadingModal() {
    if ($("#connecting-to-facebook").length) {
      $("#connecting-to-facebook .cancel").unbind('click');
      $("#connecting-to-facebook .cancel").click(function() {
        document.location.href="/ep/account/sign-out";
      });
      modals.showModal("#connecting-to-facebook", 0);
    }
  }

  function authAndForward(response) {
    if (response.authResponse) {
      /* when you post a few things might happen:
      1. if this user if fb-connected, you'll get logged in
      2. if this email exists, but is not fb connected, you'll get logged in & fb-connected
      3. if this user isn't findable by email or fbid, you'll get a "create or connect" dialog */
      $.post("/ep/account/connect-fb-session",
          { access_token: response.authResponse.accessToken, cont: cont },
          function(response) {
            if (response.success && response.cont) {
              if (document.location.href == response.cont) {
                // this won't cause an infinite loop because the server ensures
                // that we've just logged in before giving us a response.cont
                document.location.reload();
              } else {
                document.location.href = '/ep/account/safe-redirect?cont=' + encodeURIComponent(response.cont);
              }
            } else if (response.html) {
              $(response.html).appendTo("body").attr("id", "response-html");
              modals.hideModal(0);
              modals.showModal("#response-html");
              return;
            }

            if ($("#connecting-to-facebook").length) {
              modals.hideModal();
            }
          }
      );
    } else {
      // login failed or cancelled
      if ($("#connecting-to-facebook").length) {
        modals.hideModal();
      }
    }
  }

  $(function() {
    if (top == window) { /* not in a frame */ } else { $("body").addClass("fbcanvas"); }
    if (clientVars.disableFB) {
      return;
    }

    $('body').prepend('<div id="fb-root" />');
    $.getScript("https://connect.facebook.net/en_US/all.js", function() {
      //FB.Event.subscribe('auth.login', authAndForward);
      //FB.Event.subscribe('auth.logout', function() {
        //$.get("/ep/pad/auth-logout-tracker", {}, null);
        // disable auto-logout for now
        // location.href = "/ep/account/sign-out";
      //});

      var checkStatus = clientVars['shouldGetFbLoginStatus'];

      // The global FB should have been set if the fetched script executed without
      // external intervention (browser extensions)
      if (!window.FB) {
        return;
      }

      FB.init({appId: clientVars.facebookClientId, status: false, cookie: false, xfbml: false,
        channelUrl: location.protocol+'//'+location.host+'/static/fbchannel.html', oauth: true,
        frictionlessRequests : true });
      if (checkStatus) {

        FB.getLoginStatus(function(response) {
          if (response.status == 'connected') {
            authAndForward(response);
          }

        });
      } else {
        FB.getLoginStatus(function(response) {
          // homepage facepile hiding/showing
          if (response.status === 'connected') {
              $('#facepile').show();
          } else if (response.status === 'not_authorized') {
              $('#facepile').show();
          } else {
              // the user isn't logged in to Facebook. so hide the facepile
          }
        });
      }

      // try to avoid http
      if (top != window && !clientVars.isEmbed) {
        FB.Canvas.setAutoGrow(true);
      }
    });

    $('.fb-login-required').click(function() {
      cont = cont || $(this).attr('href');

      // unsubscribe from the event since we're providing a callback
      FB.Event.unsubscribe('auth.login', authAndForward);

      // work around ios6 bug
      var isIOS =  navigator.userAgent.match(/(iPod|iPhone|iPad)/);
      var response = null;
      function _fbLoginDone(_response) {
        if (!isIOS) {
          authAndForward(_response)
        } else {
          response = _response;
        }
      }

      if (clientVars.useFbChat) {
        FB.login(_fbLoginDone, { scope: 'email,xmpp_login' });
      } else {
        FB.login(_fbLoginDone, { scope: 'email' });
      }

      // work around ios6 bug
      var intervalId = setInterval(function() {
        if( response ) {
          clearInterval(intervalId);
          authAndForward(response);
        }
      }, 100 );

      _showFacebookLoadingModal();

      return false;
    });

    $('.fb-logout').click(function() {
      cont = cont || $(this).attr('href');
      if (!(FB.getAccessToken && FB.getAccessToken())) {
        // Shortcut the execution of getLoginStatus which can become a noop
        // when tracker blocking browser extensions are active, breaking logout.
        // returning true allows the event to propagate with default link click handling.
        return true;
      }

      // this might not be an FB session and FB.logout doesn't call callback if there's no session
      FB.getLoginStatus(function (response) {
        if (response.authResponse) {
          FB.logout(function(response) {
            location.href = cont;
          });
        } else {
          location.href = cont;
        }
      });
      return false;
    });
  });

  var self = {
    sharePad: function() {
      FB.ui({ method: 'stream.share',
              u: document.location.href });
    },

    publishPad: function(targetId) {
      function _fbUIPublish(desc) {
        var friendlyUrl = location.protocol+'//'+location.host+location.pathname+'?invitingId='+clientVars.userId.substr(2)+location.hash;
        FB.ui({
          method: 'stream.publish',
          target_id: targetId,
          attachment: {
            name: pad.getTitle(),
            caption: "Edit now with {*actor*} in real-time",
            description: desc || "Access to this Hackpad is by invitation only.",
            href: friendlyUrl,
            comments_xid: pad.getPadId()
          },
          action_links: [
            { text: 'Edit now', href: friendlyUrl }
          ]
          }, function(response) {
            if (response && response.post_id) {
              trackEvent('shareFacebook', { padId: clientVars.padId, post_id: response.post_id });
            }
          });
      }
      if (pad.padOptions.guestPolicy == "deny") {
        _fbUIPublish();
      } else {
        /* Fetch most recent editor text. */
        var text = padeditor.ace.exportText();

        var desc = $.trim(text.substring(0, 300)); /* Facebook posts are limited to 300 chars */
        desc = $.trim(desc.substring(desc.indexOf('\n')+1)); /* Skip first non-empty title line */
        desc = desc.substring(0, desc.lastIndexOf('.')+1) /* Truncate at sentence/newline/word boundary */
                  || desc.substring(0, desc.lastIndexOf('\n')+1)
                  || desc.substring(0, desc.lastIndexOf(' ')+1)
                  || desc;
        _fbUIPublish(desc);
      }
    },

    postGraphFollowPad: function() {
      if (!clientVars.facebookId) { return; }
      FB.getLoginStatus(function() {
        var access_token = FB.getAccessToken();
        if (!access_token) { return; }
        FB.api("/me/hackpad:follow", "post",
          { pad: location.href, access_token: access_token },
          function() {
            // nothing.
          });
        FB.api("/me/hackpad:subscribe", "post",
          { pad: location.href, access_token: access_token },
          function() {
            // nothing.
          });
      });
    },

    postGraphFollowCollection: function() {
      if (!clientVars.facebookId) { return; }
      FB.getLoginStatus(function() {
        var access_token = FB.getAccessToken();
        if (!access_token) { return; }
        FB.api("/me/hackpad:follow", "post",
          { collection: location.href, access_token: access_token },
          function() {
            // nothing.
          });
        FB.api("/me/hackpad:subscribe", "post",
          { collection: location.href, access_token: access_token },
          function() {
            // nothing.
          });
      });
    },

    postGraphEditTimestamp: null,

    postGraphEdit: function(fn) {
      if (!clientVars.facebookId) { return; }
      if (padfacebook.postGraphEditTimestamp) {
        return; /* only post once per session */
      }
      padfacebook.postGraphEditTimestamp = new Date();

      FB.getLoginStatus(function() {
        var access_token = FB.getAccessToken();
        if (access_token) {
          FB.api("/me/hackpad:edit", "post", {
            pad: location.href, access_token: access_token }, function() {
              // nothing.
          });
        }
      });
    }
  };
  return self;
}());
