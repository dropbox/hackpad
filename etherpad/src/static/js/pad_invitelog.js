
var padinvitelog = (function() {
  var self = {
    init: function() {
      if (!$('#inviteLog').length) {
        return;
      }
      $.get("/ep/api/pad-invite-info", { padId: pad.getPadId() }, function(data) {
        if (!data || !data.length) { return; }

        var overflowEl = $('<div>').addClass('inviteLog-overflow').hide();
        var extraInviteeInfo = $('<div>').
            addClass('inviteLog-extra').
            text('...').
            on('click', function() {
              extraInviteeInfo.hide();
              overflowEl.show();
            });

        for (var i = 0; i < data.length; i++) {
          var entry = data[i];
          var html;

          var isOverflow = data.length > 20 && (i > 9 && i < data.length - 10);
          if (isOverflow && i == 10) {
            $("#inviteLog").append(extraInviteeInfo).append(overflowEl);
          }

          if (entry.group) {
            html = $($("#template-invite-group-entry").html());
            html.find(".collection").attr("href", "/ep/group/" + entry.group.groupId).text(entry.group.name);
          } else if (entry.user) {
            html = $($("#template-invite-user-entry").html());
            html.find(".user").attr("href", entry.user.userLink).text(entry.user.name);
            if (entry.lastAccessedTimestamp) {
              html.find(".lastAccessedTimestamp").attr("title", entry.lastAccessedTimestamp).prettyDate();
              html.find(".lastAccessed").show();
            }
          } else {
            html = $($("#template-user-create-entry").html());
          }

          html.find("img").attr("src", entry.host.userPic);
          html.find(".host").attr("href", entry.host.userLink).text(entry.host.name);
          html.find(".timestamp").attr("title", entry.timestamp).prettyDate();
          if (isOverflow) {
            overflowEl.append(html);
          } else {
            $("#inviteLog").append(html);
          }
        }
        $("#inviteLog").show();
      });
    }
  };
  return self;
}());
