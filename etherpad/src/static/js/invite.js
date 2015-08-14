/*
Usage:

  $("#friend-picker").invite()({
    recentUsers: ,
    recentGroups: ,
    allowGroups: ,
    itemTypeToUrl: );

*/

(function( $ ){

  $.fn.invite = function( options ) {

    var settings = {
      target: 'Pad',
      recentUsers: [],
      recentGroups: [],
      minChars: 0,
      inviteItemHandlers: {},
      width: navigator.userAgent.match(/iPad/i) != null ? "120px" : "177px",
      dataURL: "/ep/invite/autocomplete",
      prompt: undefined,
      createCollection: false
    };

    return this.each(function() {
      // If options exist, lets merge them
      // with our default settings
      if ( options ) {
        $.extend( settings, options );
      }
      var friendPicker = $(this);

      function preparse(data) {

        // what to show before the user typed anything
        if (!friendPicker.val()) {
          var data = [];
          if (settings.createCollection) {
            this.resultsClass += ' ac-results-collections';
            $('#collections-recent-list li').each(function(index, el) {
              data.push({
                data: ["<span>"+ $(el).text() +"</span>", "", $(el).attr('groupid'), "hpgroup"],
                result: '',
                value: ''
              });
            });
          } else if (settings.prompt) {
            data = [{
              data: ["<span style='font-style: italic; color: grey;' class='placeholder'>"+settings.prompt+"</span>",
                     null, null, null],
              value: "",
              result: ""
            }];
          }
          if (settings.recentUsers.length > 0 || settings.recentGroups.length > 0) {
            data.push({data: ["<hr class='placeholder'/>", null, null, null],
                       value: "",
                       result: "" });
          };

          data = data.concat(settings.recentUsers.slice(0, 3).map(function(info) {
            return {
              data: ["<span style=''>" + info.fullName + "</span>",
                     null, info.id, "hp"],
              value: info.fullName,
              result: ""
            };
          }));

          var mostRecent = function(a, b) { return b.timestamp - a.timestamp; };
          data = data.concat(settings.recentGroups.sort(mostRecent).slice(0, 3).map(function(info) {
            return {
              data: ["<span style=''>" + info.name + " " + "<span style='color: grey;'>(" + info.userCnt + ")</span></span>",
                     null, info.groupId, "hpgroup"],
              value: info.name,
              result: ""
            };
          }));

          return data;
        // what to show if we see an @ sign
        } else if (friendPicker.val().indexOf('@') > -1) {
          var invitees = [];
          var people = friendPicker.val().split(",");
          for (var i=0; i<people.length; i++) {
            // First try to extract a valid name and email
            var NameEmailRE = /"?([^"]*)"?\s+<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4})>/i;
            var groups = people[i].match(NameEmailRE);
            if (groups){
              invitees.push(groups[2]);
            // Then just a valid email
            } else {
              var EmailRE = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4})\b/i;
              var groups = people[i].match(EmailRE);
              if (groups){
                invitees.push(groups[1]);
              }
            }
          }

          var who = padutils.escapeHtml(friendPicker.val());
          if (invitees.length > 1) {
            who = invitees.length + " people";
          }
          return [{
            data: ["<img src='" + location.protocol + "//mail.google.com/favicon.ico' style='float: right;' width='16' height='16'/><span style=''>Invite " + who + "</span>",
                   invitees.join(","), null, "typedemail"],
            value: friendPicker.val(),
            result: ""
          }];
        } else {
          if (settings.createCollection) {
            this.resultsClass += ' ac-results-collections';
            var word = friendPicker.val();
            var data = [];
            data.push({
              data: ["<span><i class='icon-new ac-results-create-val-plus'></i> "+ padutils.escapeHtml(word) +"</span>", word, null, "newgroup"],
              result: "",
              value: word
            });

            return data;
          }
        }
        return [];
      }


      function parse(response) {
        var data = "";
        if (response.success) {
          data = response.data;
        } else {
          modals.showHTMLModal(response.html);
          $("input").blur();
          return [];
        }
        var parsed = [];

        var rows = data.split("\n");
        var icons = {
          'hp': "<img src='/favicon.ico' style='float: right;'/>",
          'hpgroup': '',
          'fb': "<img src='" + location.protocol + "//facebook.com/favicon.ico' style='float: right;'/>",
          'email': "<img src='" + location.protocol + "//mail.google.com/favicon.ico' style='float: right;' width='16' height='16'/>"
        };
        for (var i=0; i < rows.length; i++) {
          var row = $.trim(rows[i]);
          if (row) {
            row = row.split("|");
            parsed[parsed.length] = {
              data: [icons[row[2]] + '<span style="overflow: hidden; display: block; text-overflow: ellipsis;">' + row[0] + '</span>'].concat(row),
              value: row[0],
              result: ""
            };
          }
        }

        parsed = parsed.concat(preparse(data));

        return parsed;
      }

      // disable submit on wrapping form
      friendPicker.closest("form").submit(function(event) {event.preventDefault(); return false;});

      function resultHandler (event, item) {
        // GA
        var typeToLabel = {fb: 'fbinvite', hp: 'hpinvite', hpgroup: 'groupinvite',
            email: 'emailinviteautocomplete', typedemail: 'emailinvite'};
        if (item[3] in typeToLabel) {
          var invitees = 1;
          if (item[3] == 'typedemail') {
            invitees = item[1].split(',').length;
          }

          trackEvent("invited", null, null, { type: typeToLabel[item[3]], count: invitees, target: settings.target });
        }


        var inviteItemHandler = settings.inviteItemHandlers[item[3]] || settings.inviteItemHandlers['*'];
        if (!inviteItemHandler) {
          //panic
          return;
        }

        if (inviteItemHandler.callback) {
          inviteItemHandler.callback(item);
        } else if (inviteItemHandler.url) {
            friendPicker.addClass("ac_loading");
            $.post(inviteItemHandler.url, inviteItemHandler.argsCallback(item), function(data) {
              friendPicker.removeClass("ac_loading");
              if (typeof(data) == 'object' && 'success' in data && data.success == false) {
                if (inviteItemHandler.onFailure) {
                  inviteItemHandler.onFailure(data);
                }
              } else {
                if (inviteItemHandler.onSuccess) {
                  inviteItemHandler.onSuccess(data);
                }
              }
            });
        }
      }

      friendPicker.autocomplete(settings.dataURL, {
        max:50,
        parse: parse,
        noCache:true,
        preparse: preparse,
        alwaysPreparse:true,
        minChars: settings.minChars,
        width:settings.width,
        selectFirst: true,
        extraParams: settings.extraParams
      }).result(resultHandler);
    });
  }
})( jQuery );


