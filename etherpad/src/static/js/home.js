var home = new (function() {

  this.initFriendPicker = function () {
    $("#friend-picker.invite-to-site").invite({
      target: 'Site',
      dataURL: "/ep/invite/autocomplete?emailonly=1",
      inviteItemHandlers: {
        'fb': {
          callback: function (item) {
            // console.log(item);
            // unsupported right now
          }
        },
        '*': {
          callback: function(item) {
            var friendPicker = $("#friend-picker.invite-to-site");
            friendPicker.addClass("ac_loading");
            var email;
            var fullName;
            if (item[3] == "typedemail") {
              email = item[1];
              fullName = item[1];
            } else if (item[3] == "email") {
              fullName = item[1].split("<span ")[0];
              email = item[2];
            }

            if (!email) {
              alert("This does not look like a valid email address.");
              return;
            }
            if(!clientVars.isAdmin) {
              var confirmed = confirm("You are about to grant full site access to <"+email+">. An admin will be informed. Continue?");
              if (!confirmed) {
                return;
              }
            }
            $.post("/ep/invite/invite",
              {
                email: email,
                fullName: fullName
              },
              function(response) {
                if (typeof(response) == 'object' && 'success' in response && response.success == false) {
                  alert(response.message);
                } else {
                  $("#domain-members").refresh(function () {
                    home.initFriendPicker();
                    $('input[placeholder]').placeholder();
                    $("#friend-picker.invite-to-site").focus();
                  });
                }
              })
            .fail(function() {
              alert("An error has occured. Please contact support if this error persists.");
            }).always(function() {
              friendPicker.removeClass("ac_loading");
            });
          },
        }
      }
    });
  };

  this.init = function() {
    $(".signup-form-toggle").click(function() {
      $('#nofacebooksignup').toggle();
      $('input[placeholder]:visible').placeholder();
      $('#signup-form #name').focus();
      return false;
    });

    $("#signin-button, #features-signup-button, .signin-button").click(function() {
      $(".signin-tab").click();
      modals.showModal('#page-login-box', 0);
      $('input').blur();
    });

    $("#signup-button").click(function() {
      $(".signup-tab").click();
      modals.showModal('#page-login-box', 0);
      $('input').blur();
    });

    $("#get-started-button").click(function() {
      //modals.showModal('#page-register-box', 0);
      location.href = "/AWELCOMEPAD";
    });

    $("#featured-screenshot img").click(function() {
       //modals.showModal('#page-register-box', 0);
      location.href = "/AWELCOMEPAD";
    });

    if ($('#presslogos a').length) {
        trackLinks('#presslogos a', 'presslogo');
    }

    if (clientVars && clientVars.experiment) {
        trackEvent('splashpage', null, null, {experiment: clientVars.experiment});
    }

    if ($("#friend-picker.invite-to-site").length) {
      this.initFriendPicker();
    }
  };

  return this;
})();

$(document).ready(function() {
  home.init();
});
