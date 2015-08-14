
var padguestpolicy = (function() {
  var changingGuestPolicy = false;

  function _updateAccessUI(iconclass) {
    $('#padaccesslogo').removeClass().addClass(iconclass);
    if (clientVars.isProPad && clientVars.isPadAdmin) {
      $('#padaccess-menu').removeAttr('disabled');
      $('#padaccess-menu').parent().removeAttr('data-tooltip');
    }
    $("#fb-share-container").show();
    $("#padusers").addClass("owner");
  }

  var self = {
    init: function() {
      function updatePolicy(newGuestPolicy) {
        var newGroupId = false; //deprecated: $(selected).attr("groupId");
        if (!newGuestPolicy && !newGroupId) {
          return false;
        }
        if (newGroupId) {
          pad.changePadOption('groupId', newGroupId);
        } else if (pad.getPadOptions().guestPolicy != newGuestPolicy) {
          // update server
          pad.changePadOption('guestPolicy', newGuestPolicy);
        }
        if (newGuestPolicy == "allow" || newGuestPolicy == "friends" || newGuestPolicy == "link") {
          $("#network-share-box").show();
        } else if (newGroupId) {
          padfacebook.publishPad(newGroupId);
          /*
           $.post("/ep/pad/facebookpublish", { padId: pad.getPadId(), targetId: newGroupId }, function() {
           });
           */
        } else {
          $("#network-share-box").hide();
        }
        $("select.padaccess").blur();
      }

      padutils.tooltip("#padaccess-menu");
      $('#padaccess-menu li a').on('click', function(event) {
        var newGuestPolicy = $(event.currentTarget).attr('id').split('-')[1];
        $('#padaccess-menu li a.selected').removeClass('selected');
        $('#padaccess-menu li #padaccess-' + newGuestPolicy).addClass('selected');
        $('#padaccess-menu .hp-ui-button-content').html($('#padaccess-menu li a.selected i').clone());
        $('#padaccess-menu').attr('data-tooltip', $('#padaccess-menu li a.selected').text() + " can access");
        updatePolicy(newGuestPolicy);
        return false;
      });
    },

    setGuestPolicy: function(newPolicy) {
      if (changingGuestPolicy) {
        // prevent re-entry
        return;
      }
      changingGuestPolicy = true;
      $('#padaccess-menu li a.selected').removeClass('selected');
      $('#padaccess-menu li #padaccess-' + newPolicy).addClass('selected');
      $('#padaccess-menu .hp-ui-button-content').html($('#padaccess-menu li a.selected i').clone());
      $('#padaccess-menu').attr('data-tooltip', $('#padaccess-menu li a.selected').text() + " can access");
      _updateAccessUI(newPolicy);
      changingGuestPolicy = false;
    },

    // Deprecated
    setGroupId: function(groupId) {
      $('select.padaccess option[groupId="' + groupId + '"]').attr('selected', 'selected');
      _updateAccessUI("group");
    }
  };
  return self;
}());
