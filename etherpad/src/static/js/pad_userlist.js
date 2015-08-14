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


var paduserlist = (function() {
  var myUserInfo = {};
  var includeMyUserInfo = false;
  var persistentUserIds = {};
  var groupInfos = {};
  var userInfos = {};
  var initialized = false;

  function getUserRowHtml(info) {
    var name = info.name || "Guest";
    var titleText = [name, info.status].join(' \n');
    var connected = info.status == 'connected';
    var enableKill = info.userId != myUserInfo.userId

    var dom = $($('#template-user-list').html());
    $(dom).attr({"id": 'user' + info.userId.replace(".", "-"), "title": ''});

    if (info.userLink) {
      $(dom).find("figure a").attr("href", info.userLink);
      if (clientVars.isEmbed) {
        $(dom).find("figure a").attr("target", "_blank");
      }
    } else {
      $(dom).find("figure a").attr("name", "guest");
    }

    $(dom).find("figure .user-image img").attr({
      "data-src": info.userPic || "/static/img/nophoto.png",
      "alt": ''});

    if (!connected) {
      $(dom).find("span.connected").remove();
    }

    $(dom).find("figcaption span").text(name);

    if (enableKill) {
      $(dom).find("figcaption img").attr({ "data-userId": info.userId,
                                           "data-name": name});
    } else {
      $(dom).find("figcaption img").remove();
    }

    return dom;
  }

  var self = {
    init: function(myInitialUserInfo, invitedUserInfos, invitedGroupInfos, optIncludeMyUserInfo) {

      self.setMyUserInfo(myInitialUserInfo);
      includeMyUserInfo = optIncludeMyUserInfo;

      $("#otheruserstable li").remove();

      // initialize explicitly invited groups
      for (var i = 0; i < invitedGroupInfos.length; i++) {
        self.groupJoinOrUpdate(invitedGroupInfos[i]);
      }

      // initialize explicitly invited users
      for (var i = 0; i < invitedUserInfos.length; i++) {
        self.userJoinOrUpdate(invitedUserInfos[i]);
      }

      // add my-self to the userlist
      self.userJoinOrUpdate(myInitialUserInfo);
      initialized = true;

      self.updateUserList();
      window.setInterval(self.updateUserList, 1000);

      var toggleShareList = function() {
        //var newTooltip = $("#sharesummary").attr('data-altTooltip');
        //$("#sharesummary").attr('data-altTooltip', $("#sharesummary").attr('data-tooltip'));
        //$("#sharesummary").attr('data-tooltip', newTooltip);
        if ($("#otheruserstable").hasClass('open')) {
          $("#otheruserstable, #otheruserstable-wrapper").removeClass("open").scrollTop(0);
          self.updateShareSummary();
        } else {
          $("#otheruserstable, #otheruserstable-wrapper").addClass("open");

          // Load all of the rest of the images.
          $("#otheruserstable img[data-src]").each(function(index) {
            $(this).attr('src', $(this).attr('data-src')).
                removeAttr('data-src');
          });
        }
      };
      $("#otherusers-facepile, #sharesummary").on('click', function(e) {
        toggleShareList();
        return false;
      });
      $('body').on('click', function(event) {
        if ($(event.target).is('#otherusers') ||
            $(event.target).parents('#otherusers').length ||
            $(event.target).is('#killuser') ||
            $(event.target).parents('#killuser').length) {
          return;
        }
        $("#otheruserstable, #otheruserstable-wrapper").removeClass("open").scrollTop(0);
      });

      $(".killuser").live("click", function(ev) {
        ev.preventDefault();
        var userId = $(this).attr("data-userId");
        var name = $(this).attr("data-name");
        var access = typeof(pad) != "undefined" ? pad.getPadOptions().guestPolicy : "deny";
        var accessName = $("select.padaccess option[value=" + access + "]").text();

        $("#killuser span.name").text(name);
        $("#killuser span.access").text(accessName);
        $("#killuser-access").toggle(access == "link" || access == "allow");
        //$("#killuser-form input#padId").val(pad.getPadId());
        $("#killuser-form input#userId").val(userId);
        modals.showHTMLModal("#killuser");
        return true;
      });
    },
    setMyUserInfo: function(info) {
      myUserInfo = $.extend({}, info);
    },
    userEdited: function(userId) {
      if (userId && userId != myUserInfo.userId) { // FIXME: userId is empty sometimes
        persistentUserIds[userId] = new Date();
      }
    },
    userListQueue: [],
    userListHighlight: false,
    userJoinOrUpdate: function(info) {
      if (!$('#otheruserstable').length) {
        return;
      }

      self.userListHighlight = false;
      if (initialized && !userInfos[info.userId]) {
        self.userListHighlight = true;
      }

      userInfos[info.userId] = info;

      if (info.status == "editor" || info.status == "invited") {
        persistentUserIds[info.userId] = true;
      }
      function smallerThan(a, b) {

        if (typeof(a) == "object") {

          for (var i=0; i<a.length; i++) {
            if (a[i]<b[i]) {
              return true;
            }
          }
        } else {
          return a < b;
        }
        return false;
      }
      function sortKey(userItem) {
        //sort icon list online | faces i know | faces i don't | faceless
        //[online but not me, me, has_face, is_friend, name]
        var userId = userItem.attr('id').slice(4).replace("-", ".");
        var info = userInfos[userId];
        if (!info) {
          return [true, true, true, ''];
        }
        var isFriend = clientVars.friendUserIds.indexOf(parseInt(userId.slice(2))) > -1;
        return [info.status != "connected" && userId == clientVars.userId,
          userId != clientVars.userId,
          info.userPic == null,
          !isFriend,
          info.name ? info.name.toLowerCase() : ""];
      }

      function _updateUser(container, userItem) {
        userItem = $(userItem);
        var userrows = container.find("li");
        for (var i = 0; i < userrows.length; i++) {
          var row = $(userrows[i]);
          if (smallerThan(sortKey(userItem), sortKey(row))) {
            // insert in sort order 
            row.before(userItem);
            return;
          }
        }
        // insert at the end of the table
        container.append(userItem);
      }

      self.userListQueue.push(function() {
        $("#otheruserstable #user" + info.userId.replace(".", "-")).remove();
        var userItem = getUserRowHtml(info);

        _updateUser($("#otheruserstable"), userItem);

        // Load in the image if it's in the viewable area, doing setTimeout so
        // that we check after the DOM has rendered.
        window.setTimeout(function() {
          var boundingBoxEl = $("#otheruserstable");
          var imageEl = userItem.find('img[data-src]');
          if (imageEl.length &&
              imageEl.offset().top - boundingBoxEl.offset().top <
              boundingBoxEl.height()) {
            imageEl.attr('src', imageEl.attr('data-src')).removeAttr('data-src');
          }
          $('#otherusers-facepile').attr('src', $("#otheruserstable li:first-child img").attr('src'));
        }, 0);

      });
    },
    updateUserList: function() {
      if (!self.userListQueue.length || !$('#otheruserstable').length) {
        return;
      }

      $('#otheruserstable').hide();
      for (var x = 0; x < self.userListQueue.length; ++x) {
        self.userListQueue[x]();
      }

      $('#otheruserstable').show();
      self.userListQueue = [];

      if ($("#otheruserstable li").length >= 2) {
        $("#sharesummarywrapper").show();
      }

      self.updateShareSummary(self.userListHighlight);
      self.userListHighlight = false;
    },
    userLeave: function(info) {
      if (info.userId == myUserInfo.userId) {
        // collab server booted me from another tab
        return;
      }

      if (!persistentUserIds[info.userId]) {
        $("#user" + info.userId.replace(".", "-")).remove();
        delete userInfos[info.userId];
        self.updateShareSummary();
      } else {
        info.status = "disconnected";
        self.userJoinOrUpdate(info);
      }
    },
    userKill: function(info) {
      // USER_KILL info only has userId
      delete persistentUserIds[info.userId];
      delete userInfos[info.userId];
      $("#user" + info.userId.replace(".", "-")).remove();
      self.updateShareSummary();
    },
    updateShareSummary: function(highlight) {
      var parts = [];

      function _shareSummaryItem(content) {
        return $("<span class='sharesummarypart'/>").text(content);
      }

      // list all groups
      for (var groupId in groupInfos) {
        parts.push(_shareSummaryItem(groupInfos[groupId].name));
      }

      var userCount = 0;
      var othersCount = 0;
      for (var userId in userInfos) { 
        if (userId == myUserInfo.userId) {
          // don't list myself in the summary
          continue;
        }

        // list up to 2 users
        if (parts.length<2) {
          parts.push(_shareSummaryItem(userInfos[userId].name));
        } else {
          othersCount++;
        }
        userCount++;
      }

      if (includeMyUserInfo) {
        parts.push(_shareSummaryItem(myUserInfo.name));
      }

      if (othersCount) {
        parts.push (_shareSummaryItem("and " + othersCount + " others"));
      }

      $("#sharesummary").empty();
      if (!parts.length) {
        $("#sharesummary").append(_shareSummaryItem("nobody"));
      }
      for (var i=0; i<parts.length; i++) {
        $("#sharesummary").append(parts[i]);
        if (i < parts.length-1) { 
          $("#sharesummary").append(_shareSummaryItem(', '));
        }
      }
      if (highlight) {
        $("#sharesummary").css('background-color', '#FCFFB3').animate({'background-color': "transparent"}, 1000);
      }

      $('#otherusers-facepile').toggleClass('multiple',
          $("#otheruserstable li").length >= 2);

      // Load in the image if it's in the viewable area, doing setTimeout so
      // that we check after the DOM has rendered.
      window.setTimeout(function() {
        var boundingBoxEl = $("#otheruserstable");
        if ($("#otheruserstable").hasClass('open')) {
          return;
        }

        boundingBoxEl.find('li').each(function(index, userItem) {
          userItem = $(userItem);
          var imageEl = userItem.find('img[data-src]');
          if (imageEl.length &&
              imageEl.offset().top - boundingBoxEl.offset().top <
              boundingBoxEl.height()) {
            imageEl.attr('src', imageEl.attr('data-src')).removeAttr('data-src');
          } else if (imageEl.length) {
            // The rest of the images are hidden.
            return false;
          }
        });
      }, 0);
    },
    groupJoinOrUpdate: function(info) {
      $("#sharesummarywrapper").show();

      groupInfos[info.groupId] = info;
      self.updateShareSummary();
    }
  };
  return self;
}());
