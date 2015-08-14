$(function(){

  $('.padaccess').customStyle();

  // add/create pad autocompleter
  var MAX_SEARCH_RESULTS = 8;
  function parse(response) {
    var data = "";

    if (response.success) {
      data = response.data;
    } else {
      // search failed, show failure dialog
      modals.showHTMLModal(response.html);
      $("input").blur();
      return [];
    }

    var parsed = [];

    var rows = data.split("\n");
    for (var i=0; i < rows.length; i++) {
      var row = $.trim(rows[i]);
      if (row) {
        row = row.split("|");

        parsed.push({
          data: row,
          value: row[0],
          result: row[0]
        });
      }
    }
    if (parsed.length >= MAX_SEARCH_RESULTS) {
      parsed = parsed.slice(0, MAX_SEARCH_RESULTS - 1);
    }

    return parsed.concat(preparse());
  }

  function preparse() {
    var val = padutils.escapeHtml($('#pad-picker').val());
    return [
      {data: ["<span style='font-style: italic;'>Create pad " + val + "</span>",
                   val.replace(/ /g, '-'), "__AUTOCREATE__"],
            value: val,
            result: val}
    ];
  }

  function handleAutocompleteResult(event, item) {
      $('#pad-picker').addClass("ac_loading");
      if (item[2] == '__AUTOCREATE__') {
        var title = item[1];
        $.post('/ep/pad/ajax_create',
          {title: title, content: "", groupId: clientVars.groupId },
          function(response) {
            document.location.reload();
          }
        );
      } else {
        $.post("/ep/group/add-pad", { groupId: clientVars.groupId, padId: item[1] },
          function (response) {
            document.location.reload();
          }
        );
      }
    }

  var padPickerWidth = $('#pad-picker').width() + 22 + "px";
  $('#pad-picker').autocomplete("/ep/search/autocomplete",
    {max:MAX_SEARCH_RESULTS, parse: parse, preparse:preparse,  delay: 0,
      noCache:true, selectFirst: true, width: padPickerWidth}
    ).result(handleAutocompleteResult);

  var myUserInfo = {
    userId: clientVars.userId,
    name: clientVars.userName,
    status: "connected",
    userLink: clientVars.userLink,
    userPic: clientVars.userPic
  };
  paduserlist.init(myUserInfo, clientVars.invitedUserInfos, clientVars.invitedGroupInfos);

  // Enable tooltips
  padutils.tooltip("[data-tooltip]");

  function onInviteSuccess (data) {
            paduserlist.userJoinOrUpdate(data.userInfo);
  }
  var inviteItemHandlers = {
    'fb': {callback: function(item) {}},
    'hp':   {url:"/ep/group/add",
              argsCallback: function(item) {
                return {groupId: clientVars.groupId, userId: item[2]};
              },
              onSuccess: onInviteSuccess
    },
    'email': {url:"/ep/group/add",
              argsCallback: function(item) {
                return {groupId: clientVars.groupId, toAddress: item[2]};
              },
              onSuccess: onInviteSuccess
    },
    'typedemail': {url:"/ep/group/add",
              argsCallback: function(item) {
                return {groupId: clientVars.groupId, toAddress: item[1]};
              },
              onSuccess: onInviteSuccess
    }

  };
  $("#friend-picker").invite({
    target: 'Group',
    inviteItemHandlers: inviteItemHandlers
  });


  $(".renameable").live("click", function() {
    var label = $(this);
    var editname = $($("#editname").html());
    var input = editname.find("input[name=name]");

    input.css({
      "font-size": label.css("font-size"),
      "font-family": label.css("font-family"),
      "font-weight": label.css("font-weight"),
      "margin-top": label.css("margin-top"),
      "margin-bottom": label.css("margin-bottom"),
      "padding-top": label.css("padding-top"),
      "height": label.css("height"),
      "color": label.css("color"),
      "border": label.css("border")
    }).val(label.text());

    editname.find("a.cancel").click(function() {
      editname.replaceWith(label);
      return false;
    });

    editname.validate({
      rules: {
        name: { required: true}
      },
      submitHandler: function(form) {
        $.post($(form).attr('action'), $(form).serialize(), function (resp) {
          if (resp.success) {
            label.text($(form).find("input[name=name]").val());
            editname.replaceWith(label);
          }
        });
        return false;
      }
    });

    label.replaceWith(editname);
    input.focus();
  });

  // pad access control
  $('#padaccess-menu li a.selected').removeClass('selected');
  $('#padaccess-menu li #padaccess-' + (clientVars.isPublic ? 'allow': 'deny')).addClass('selected');
  $('#padaccess-menu .hp-ui-button-content').html($('#padaccess-menu li a.selected i').clone());
  $('#padaccess-menu').attr('data-tooltip', $('#padaccess-menu li a.selected').text());

  padutils.tooltip("#padaccess-menu");
  $('#padaccess-menu li a').on('click', function() {
    var newGuestPolicy = $(event.currentTarget).attr('id').split('-')[1];
    $('#padaccess-menu li a.selected').removeClass('selected');
    $('#padaccess-menu li #padaccess-' + newGuestPolicy).addClass('selected');
    $('#padaccess-menu .hp-ui-button-content').html($('#padaccess-menu li a.selected i').clone());
    $('#padaccess-menu').attr('data-tooltip', $('#padaccess-menu li a.selected').text());
    $.post("/ep/group/set_access",
      { groupId: clientVars.groupId, isPublic: newGuestPolicy == "allow" },
      function (data) {
        // fix me, if the request fails fallback to old value.
      });
    return false;
  });

  // follow button
  if (clientVars.isMember) {
    $(".groupfollow").hide();
    $(".groupunfollow").show();
  } else {
    $(".groupfollow").show();
    $(".groupunfollow").hide();
  }
  trackEvent('group-visit');
});

function _isCollectionPublic() {
  return $('#padaccess-menu li a.selected').attr('id') == 'padaccess-allow';
}

function toggleGroupFollow(that) {
  var action = "remove";
  if ($(that).hasClass("groupfollow")) {
    action = "join";
  }
  $.post("/ep/group/" + action, { groupId: clientVars.groupId, userId: clientVars.userId },
    function(data) {
      if (data && !data.success) {
        modals.showHTMLModal(data.html);
        return;
      }

      $(that).hide();
      if ($(that).hasClass("groupfollow")) {
        $('.groupunfollow').show();
        if (_isCollectionPublic()) {
          padfacebook.postGraphFollowCollection();
        }
      } else {
        $('.groupfollow').show();
      }

      trackEvent("toggleGroupFollow", action);
    });
}


  function deleteGroup() {
    if (!confirm("Are you sure you want to delete the collection \""+clientVars.groupName+"\"?")) {
      return;
    }
    $.post("/ep/group/destroy", { groupId: clientVars.groupId, reallySure: true }, function() {
      location.href = "/";
    })
  }

