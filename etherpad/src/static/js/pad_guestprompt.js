
var padguestprompt = (function() {
  var knocksToIgnore = {};
  var guestPromptFlashState = 0;
  var guestPromptFlash = padutils.makeAnimationScheduler(
    function () {
      var prompts = $("#guestprompts .guestprompt");
      if (prompts.length == 0) {
        return false; // no more to do
      }

      guestPromptFlashState = 1 - guestPromptFlashState;
      if (guestPromptFlashState) {
        prompts.css('background', '#ffa');
      }
      else {
        prompts.css('background', '#ffe');
      }

      return true;
    }, 1000);

  var self = {
    showGuestPrompt: function(userId, displayName) {
      if (knocksToIgnore[userId]) {
        return;
      }

      var encodedUserId = padutils.encodeUserId(userId);

      var actionName = 'hide-guest-prompt-'+encodedUserId;
      padutils.cancelActions(actionName);

      var box = $("#guestprompt-"+encodedUserId);
      if (box.length == 0) {
        // make guest prompt box
        box = $('<div id="guestprompt-'+encodedUserId+'" class="guestprompt"><div class="choices"><a class="deny" href="javascript:void(padguestprompt.answerGuestPrompt(\''+encodedUserId+'\',false))"> </a> <a href="javascript:void(padguestprompt.answerGuestPrompt(\''+encodedUserId+'\',true))">Allow</a></div><div class="guestname">'+padutils.escapeHtml(displayName)+'</div></div>');
        $("#guestprompts").append(box);
      }
      else {
        // update display name
        box.find(".guestname").text(displayName);
      }
      /*
      var hideLater = padutils.getCancellableAction(actionName, function() {
        self.removeGuestPrompt(userId);
      });
      window.setTimeout(hideLater, 15000); // time-out with no knock
      */
      guestPromptFlash.scheduleAnimation();
    },
    removeGuestPrompt: function(userId) {
      var box = $("#guestprompt-"+padutils.encodeUserId(userId));
      // remove ID now so a new knock by same user gets new, unfaded box
      box.removeAttr('id').fadeOut("fast", function() {
        box.remove();
      });

      knocksToIgnore[userId] = true;
      window.setTimeout(function() {
        delete knocksToIgnore[userId];
      }, 5000);
    },
    answerGuestPrompt: function(encodedUserId, approve) {
      var guestId = padutils.decodeUserId(encodedUserId);

      var msg = {
        type: 'guestanswer',
        authId: pad.getUserId(),
        guestId: guestId,
        answer: (approve ? "approved" : "denied")
      };
      pad.sendClientMessage(msg);

      self.removeGuestPrompt(guestId);
    }
  };
  return self;
}());
