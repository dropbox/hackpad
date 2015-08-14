
var padautolink = (function() {
  var autocompleteHandler = null;
  var self = {
    init: function() {
      var options =  $.extend({},$.Autocompleter.defaults, {
        width: "250px",
        formatMatch: function(row) { return row[1]; },
        max: 10,
        matchContains: "word",
        selectFirst: true,
        scroll: false,
        data: [],
        dataPeople: [],
        dataFiles: [],
        dataPads: [],
        dataTags: []
      });

      var prefixDict = null;
      var cachedQueries = {};
      var MAX_DROPBOX_RESULTS = 5;
      var cachedDropboxQueries = {};
      var lastWord = null;
      var lastStart = null;
      var lastEnd = null;
      var showedResults = null;
      var lastRealOffset = null;
      var lastAutocompleteQuery = null;
      var lastAutocompleteType = null;
      var lastPadPrivacy = null;
      var padId = pad.getPadId();
      var CONTACTS_EXPIRE_TIME_MS = 1000 * 60 * 60 * 1; // 1 hour
      var HASHTAG_REGEX = linestylefilter.REGEX_HASHTAG;
      var EMOJI_REGEX = new RegExp(/:[-a-zA-Z0-9_+]+:?/g);

      var AC_TYPE = {
        AT: "at-linking",
        ATLESS: "atless-linking",
        HASHTAG: "hashtag",
        EMOJI: "emoji",
      };

      function reset() {
        if (autocompleteHandler && showedResults) {
          autocompleteHandler("finish");
        };
        lastWord = lastStart = lastEnd = showedResults = lastRealOffset = null;
        cachedDropboxQueries = {};
        cachedQueries = {};
        select.hide();
      }

      function _getTextInRange(startPos, endPos) {
        var text;
        padeditor.ace.callWithAce(function(ace) {
          text = ace.getTextInRange(startPos, endPos);
        });
        return text;
      }

      function _insertSpaceForFirefox(oldSelStart, textInserted) {
        if ($.browser.mozilla) {
          var insertionPoint = [oldSelStart[0], oldSelStart[1]+textInserted.length];
          padeditor.ace.replaceRange(insertionPoint, insertionPoint, " ");
        }
      }

      function _safeAceReplaceRange(startPos, endPos, text, optAttribs, optOrigText) {
        if(optOrigText) {
          var currText = _getTextInRange(startPos, endPos);
          if (currText != optOrigText) {
            // console.log("Unable to replace '"+optOrigText+"', the range no longer corresponds to the given content. '"+optOrigText+"' != '"+currText+"'");
            return;
          }
        }
        padeditor.ace.replaceRange(startPos, endPos, text, optAttribs);
        _insertSpaceForFirefox(startPos, text);
      }

      function updateContacts(userContactsKey) {
        $.ajax({
            // try to leverage ajaxQueue plugin to abort previous requests
            mode: "abort",
            // limit abortion to this input
            port: "preloadContacts",
            dataType: options.dataType,
            url: "/ep/invite/prefixes",
            data: { padid: padId, excludefacebook: true },
            success: function(data) {
              prefixDict = data.data;
              var now = new Date().getTime();
              var prefixesWithTimestamp = {
                timestamp: now,
                prefixDict: prefixDict
              };
              prefixDictJSON = JSON.stringify(prefixesWithTimestamp);
              if (localStorage) {
                localStorage.setItem(userContactsKey, prefixDictJSON);
              }
            }
          });
      }

      function preloadContacts() {
        var encryptedUserId = clientVars["encryptedUserId"];
        var userContactsKey = "hackpad.user."+ encryptedUserId +".contactsPrefixes";
        var prefixDictJSON = localStorage ? localStorage.getItem(userContactsKey) : null;

        if (prefixDictJSON) {
          var prefixesWithTimestamp = JSON.parse(prefixDictJSON);
          prefixDict = prefixesWithTimestamp.prefixDict;
          var timestamp = prefixesWithTimestamp.timestamp;
          var now = new Date().getTime();
          if (now - timestamp > CONTACTS_EXPIRE_TIME_MS) {
            updateContacts(userContactsKey);
          }

        } else {
          updateContacts(userContactsKey);
        }
      }


      function stringToPrefix(fullname, length) {
        var length;
        if (length == undefined) {
          var length = 4;
        }
        var prefix = fullname;
        if (fullname.length > length) {
          prefix = fullname.substr(0,length);
        }

        // if the fullname has spaces we don't want to include those in the prefix
        // We will never see ace trigger a link including a space because it uses whitespace
        // bound string to initiate an atlink.
        prefix = prefix.split(' ')[0];
        return prefix;
      }

      function finish (selected, selectedIndex) {
        if (typeof selected == "undefined" && typeof selectedIndex == "undefined" || selected.data == null) {
          var selectedEl = select.current();
          selected = $.data(selectedEl, "ac_data");
          selectedIndex = $(selectedEl).index();
        }

        if (!selected.data[1]) { return; } // placeholder

        // action label for logging
        var logAction = "padlink"
        var label = "";
        var extraEventInfo = {
          selectedIndex: selectedIndex
        };
        if (selected.data[2] == "dropbox") {
          logAction = "dropboxlink";
        } else if (selected.data[2] == "__AUTOCREATE__") {
          logAction = "newpad";
        } else if (selected.data[2].indexOf("/ep/profile") == 0) {
          logAction = "mention";
          label = "hp";
        } else if (selected.data[3] == "email") {
          logAction = "mention";
          label = "google";
        } else if (selected.data[3] == "hashtag") {
          logAction = "hashtag";
          label = selected.data[1];
        } else if (selected.data[3] == "emoji") {
          logAction = "emoji";
          label = selected.data[1];
        }

        //console.log(logAction);
        trackEvent('autocompleted', logAction, label, extraEventInfo);

        if (selected.data[3]== "emoji") {
          var emoji = selected.data[1];
          _safeAceReplaceRange(lastStart, lastEnd, ':' + emoji + ': ');
        } else if (selected.data[3]== "hashtag") {
          var hashtag = selected.data[1];
          var tagSrpLink = "/ep/search/search?q="+encodeURIComponent(hashtag);
          _safeAceReplaceRange(lastStart, lastEnd, hashtag, [["link", tagSrpLink]]);
        } else if (selected.data[2] == "dropbox") {
          var _lastStart = lastStart;
          var _lastEnd = lastEnd;


            var name = selected.data[1];
            var url = ("/ep/dropbox/redirect2?uid="+clientVars.encryptedUserId+"&path=" + encodeURIComponent(name));

            _safeAceReplaceRange(_lastStart, _lastEnd, name, [["link", url]]);

        } else if (selected.data[2] == "__AUTOCREATE__") {
          var title = selected.data[1];

          var urlEncodedTitle = title.replace(/ /g, '-');
          var _lastStart = lastStart;
          var _lastEnd = lastEnd;
          var origText = _getTextInRange(_lastStart, _lastEnd);
          $.post('/ep/pad/ajax_create',
            {title: title, content: "", sourcePadId: pad.getPadId() },
            function(response) {
              var padUrl = "/"+response+"#"+urlEncodedTitle;
              var name = selected.data[1];
              _safeAceReplaceRange(_lastStart, _lastEnd, name, [["link", padUrl]], origText);
            }
          );
        } else {
          if (selected.data[3] == "email") {
            var title = selected.data[1];

            var urlEncodedTitle = title.replace(/ /g, '-');
            var _lastStart = lastStart;
            var _lastEnd = lastEnd;
            var origText = _getTextInRange(_lastStart, _lastEnd);
            $.post('/ep/pad/emailinvite',
              {padId:pad.getPadId(), toAddress:selected.data[2]},
              function(response) {
                  //var padUrl = "/"+response+"#"+urlEncodedTitle;
                  // todo: make an unhacky fix
                  var nameForInsertion = selected.data[1].replace(/<.*>/g, '');
                  var name = $.trim(nameForInsertion);

                  _safeAceReplaceRange(_lastStart, _lastEnd, name, [["link", response]], origText);
               }
            );

          } else {
            var nameForInsertion = selected.data[1].replace(/<.*>/g, '');
            var name = $.trim(nameForInsertion);

            _safeAceReplaceRange(lastStart, lastEnd, name, [["link", selected.data[2]]]);
          }
        }
        reset();

      }
      self.finish = finish;

      function show(word, data, start, end, offset) {
        select.display(data, word);
        //console.log(data);

        if (autocompleteHandler) {
          autocompleteHandler("autocomplete", data);
        } else {
          var frameOffset = $('#editor').offset();
          var realOffset = { x: offset.x + frameOffset.left, y: offset.y + frameOffset.top };

          if (!lastStart || start[0] != lastStart[0] || start[1] != lastStart[1]
              || !lastRealOffset || realOffset.y != lastRealOffset.y) {
            select.show(realOffset.x + "px", realOffset.y + "px");
          }
        }
        lastWord = word;
        lastStart = start;
        lastEnd = end;
        showedResults = data && data.length > 0;
        lastRealOffset = realOffset;
      }

      var select = $.Autocompleter.Select(options, padeditor.ace, finish, {});
      var cache = $.Autocompleter.Cache(options);

      preloadContacts();

      function buildSrpLinkForHashtag(hashtag) {
        return "/ep/search/?q="+encodeURIComponent(hashtag);
      }

      function processHashtagData(data) {
        if (!data.success || !data.data) { return; }

        data = data.data;

        var parsed = [];
        for (var term in data) {
          var hashtagSrpLink = buildSrpLinkForHashtag(term);
          var row = [term, term, hashtagSrpLink, "hashtag"];
          row[0] = '<div style="white-space: nowrap;  overflow: hidden; text-overflow: ellipsis;">' + row[0] + '</div>';
          parsed.push(row);
        }

        var existing = {};
        $.each(options.dataTags, function(i, r) {
          existing[r[0]] = true;
        });
        $.each(parsed, function(i, r) {
          if (!existing[r[0]]) {
            options.dataTags.push(r);
          }
        });

        options.data = options.dataTags;
        cache.populate();
      }

      function processEmojiData(data) {
        var parsed = [];
        for (var x = 0; x < data.length; ++x) {
          var term = data[x];
          var row = [term, term, '', "emoji"];
          row[0] = '<div style="white-space: nowrap;  overflow: hidden; text-overflow: ellipsis;">' +
              '<span class="emoji-glyph" style="background-image:url(' + clientVars.cdn + '/static/img/emoji/' + term + '.png)"></span>' +
              row[0] + '</div>';
          parsed.push(row);
        }

        var existing = {};
        $.each(options.dataTags, function(i, r) {
          existing[r[0]] = true;
        });
        $.each(parsed, function(i, r) {
          if (!existing[r[0]]) {
            options.dataTags.push(r);
          }
        });

        options.data = options.dataTags;
        cache.populate();
      }

      function processInviteData(data, autocompleteType) {
        if (!data.success || !data.data) { return; }

        data = data.data;

        var icons = {
          'hp': "<img src='/static/favicon.png' style='float: left; padding-right: 4px;' width='16' height='16'/>",
          'fb': "<img src='https://facebook.com/favicon.ico' style='float: left; padding-right: 4px;' width='16' height='16'/>",
          'email': "<img src='https://mail.google.com/favicon.ico' style='float: left; padding-right: 4px;' width='16' height='16'/>"
        };

        var rows = data.split("\n");
        var parsed = [];
        for (var i=0; i < rows.length; i++) {
          var row = $.trim(rows[i]);
          if (row) {
            row = row.split("|");
            if (row[2] in icons) {
              row = [icons[row[2]] + row[0]].concat(row); // add icon
              row[0] = '<div style="white-space: nowrap;  overflow: hidden; text-overflow: ellipsis;">' + row[0] + '</div>';
            }

            parsed.push(row);
          }
        }

        var existing = {};
        $.each(options.dataPeople, function(i, r) {
          existing[r[0]] = true;
        });
        $.each(parsed, function(i, r) {
          if (!existing[r[0]]) {
            options.dataPeople.push(r);
          }
        });

        options.data = options.dataPeople;

        // Only add pads and files to results if we're at-linking
        if (autocompleteType == AC_TYPE.AT) {
          options.data = options.data.concat(options.dataPads).concat(options.dataFiles);
        }
        cache.populate();
      }

      function processDropboxData (data, query) {
        var parsed = [];
        var result = JSON.parse(data);

        cachedDropboxQueries[query] = result.length;

        for (var i=0; i<result.length; i++) {
          parsed.push(["<img src='/static/img/dropbox.png' style='float: left; padding-right: 4px;' width='16' height='16'/>" + result[i].path,
            result[i].path,  'dropbox']);
        }
        options.dataFiles = parsed;
        options.data = options.dataPeople.concat(options.dataPads).concat(options.dataFiles);
        cache.populate();
      }



      // Determine if word has deviated from autocompletable options. i.e. There are no valid autocomplete
      // results
      function isQuickFail(word) {
        if (lastAutocompleteQuery) {
          var lastQuery = lastAutocompleteQuery.query;
          if (lastQuery && word.indexOf(lastQuery) == 0) {
            // (ASSUMPTION: current input produces a subset of previous input's results)
            // Check if the previous autocomplete input produced results.
            // If there were previous results, we can check if the current input
            // has results in the cache.
            // Previous inputs might not have populated the cache as ajaxQueue aborts pending requests.
            // The successful ajax response confirms that the cache was populated and we can use the
            // cache to quickfail. Otherwise, quickfail would be overly optimistic.
            var hasResults = lastAutocompleteQuery.ajaxResults || lastAutocompleteQuery.numResults > 0;
            if (hasResults) {
              var cachedAutocomplete = cache.load(word.toLowerCase()) || [];
              if (cachedAutocomplete.length == 0) {
                return true;
              }
            }
          }
        }
        return false;
      }

      function isValidHashtag(hashtag) {
        HASHTAG_REGEX.lastIndex = 0;
        return hashtag == '#' || HASHTAG_REGEX.test(hashtag);
      }

      function isValidEmoji(emoji) {
        EMOJI_REGEX.lastIndex = 0;
        return emoji == ':' || EMOJI_REGEX.test(emoji);
      }

      // The score is based on the matching position of the query
      // The max score is 0 where the query matches at the beginning of the name
      // Matching on the fifth character gives a score of -4
      function scoreAutocompleteMatch(contact, query) {
        var name = contact.data[1].toLowerCase();
        var matchIdx = name.indexOf(query);
        var score = -matchIdx;
        contact.score = score;
      }

      function isContact(autocompleteEntry) {
        var type = autocompleteEntry.data[3];
        return (type == "hp" || type == "email" || type == "fb");
      }

      function scoreAndSortAutocompleteContacts(contacts, query) {
        contacts.forEach(function(c) {
          scoreAutocompleteMatch(c, query);
        });

        // Sort the contact list in this order
        //  - By matching position (matching on first name is better than matching on last)
        //  - By contact type, hackpad contacts first
        //  - By last login time, more recent login first
        //  - By alphabetical order

        contacts.sort(function(a, b) {
          var aIsContact = isContact(a);
          var bIsContact = isContact(b);

          if (aIsContact || bIsContact) {
            if (!bIsContact) {
              return -1;
            }
            if (!aIsContact) {
              return 1;
            }
          }
          if (a.score > b.score) {
            return -1;
          }
          if (a.score < b.score) {
            return 1;
          }

          if (a.data[3] == "hp" && b.data[3] != "hp") {
            return -1;
          }
          if (a.data[3] != "hp" && b.data[3] == "hp") {
            return 1;
          }

          var aTimestamp = a.data[4] ? parseInt(a.data[4]) : null;
          var bTimestamp = b.data[4] ? parseInt(b.data[4]) : null;

          if (aTimestamp || bTimestamp) {
            if (!bTimestamp) {
              return -1;
            }
            if (!aTimestamp) {
              return 1;
            }
            if (aTimestamp > bTimestamp) {
              return -1;
            }
            if (aTimestamp < bTimestamp) {
              return 1;
            }
          }
          var aName = a.data[1].toLowerCase();
          var bName = b.data[1].toLowerCase();

          return aName.localeCompare(bName);
        });
        return contacts;
      }

      /* Called on every input action to see if we're triggering a link */
      function aceTriggerCallback(word, start) {
        // Handle all the different cases that could trigger an autocomplete
        if (!word) {
          return false;
        }

        // Are we at-linking?
        if (word[0]=='@') {
          return true;
        }

        if (isValidHashtag(word) || isValidEmoji(word)) {
          if (isQuickFail(word.substr(1))) {
            lastStart = null;
            return false;
          }
          lastStart = start;
          return true;
        }

        // Does this look like a first name of a contact?
        var prefix = stringToPrefix(word);

        // Do we have a prefix dictionary?
        if (prefixDict) {
          var validPrefix = prefix.length > 3 && prefixDict[prefix];

          if (validPrefix) {
            // Check to see if the current word deviates from previously
            // fetched autocomplete options
            if (isQuickFail(word)) {
              lastStart = null;
              return false;
            }
            lastStart = start;
            return true;
          } else {
            lastStart = null;
            return false;
          }
        }

        // Fall back to using words that look like they could be first names
        if (word.length > 3 && word[0].toUpperCase() == word[0]) {
          // This trigger is very optimistic, we need to further constrain it.
          // We don't want to keep triggering autocomplete if we know that this word
          // couldn't possibly be a prefix of a contact name.
          if (isQuickFail(word)) {
            lastStart = null;
            return false;
          }
          lastStart = start;
          return true;
        }
        return false;
      }

      /* Called every time the autocomplete string changes */
      function aceAutocompleteCallback(word, action, start, end, offset) {
        if (!word || action == "cancel" || !offset) {
          reset();
          return showedResults;
        }

        var autocompleteType;
        var promptMsg;
        switch(word[0]) {
          case '@':
            autocompleteType = AC_TYPE.AT;
            promptMsg = "Link to Hackpads and People";
            break;
          case '#':
            autocompleteType = AC_TYPE.HASHTAG;
            if (!isValidHashtag(word)) {
              reset();
              return showedResults;
            }
            break;
          case ':':
            autocompleteType = AC_TYPE.EMOJI;
            if (!isValidEmoji(word)) {
              reset();
              return showedResults;
            }
            break;
          default:
            autocompleteType = AC_TYPE.ATLESS;
        }


        var padPrivacy = pad.getPadOptions().guestPolicy;
        // We don't want the cached results from a previous autocomplete
        // to be considered if the autocompletion type has changed or if
        // the pad privacy settings have changed
        // For example, atless and at autocompletion can have very different
        // result sets.
        if ((autocompleteType != lastAutocompleteType) ||
            (padPrivacy != lastPadPrivacy)) {
          cache.flush();
          cachedQueries = {};
        }
        lastAutocompleteType = autocompleteType;
        lastPadPrivacy = padPrivacy;
        if (autocompleteType == AC_TYPE.AT && word.length == 1) {
          var data = [{
            data: ["<span style='font-style: italic; color: grey;' class='placeholder'>"+promptMsg+"</span>"],
            result: null,
            value: null
          }];
          show(word, data, start, end, offset);
          return showedResults;
        }


        if (autocompleteType != AC_TYPE.ATLESS) {
          word = word.substr(1);
        }

        // should probably put into a generic keypress dispatcher
        if (word == lastWord) {
          if (action == "up") {
            select.prev();
            return showedResults;
          } else if (action == "down") {
            select.next();
            return showedResults;
          } else if (action == "enter") {
            if (autocompleteHandler) {
              reset();
              return showedResults;
            }
            // finish resets this variable, copy its value
            var lastShowedResults = showedResults;
            finish();
            return lastShowedResults;
          }
        }

        function loadAndDisplayData(word) {
          var escapedWord = padutils.escapeHtml(word);
          var data = cache.load(word.toLowerCase()) || [];
          if (autocompleteType != AC_TYPE.HASHTAG && autocompleteType != AC_TYPE.EMOJI) {
            data = scoreAndSortAutocompleteContacts(data, word.toLowerCase());
          }
          if (autocompleteType == AC_TYPE.AT) {
            data = data.slice(0,options.max-1);
            data.push({
              data: ["<span style='font-style: italic;'>Create pad "+ escapedWord +"</span>", word, "__AUTOCREATE__"],
              result: null,
              value: null
            });
          }

          if (data.length) {
            show(word, data, start, end, offset);
          }

          lastAutocompleteQuery = {
            query: word,
            numResults: data.length
          };
        }

        // optimizations to try:
        //   don't update currently displayed items if data is same
        loadAndDisplayData(word);

        if (cachedQueries[word.toLowerCase()]) {
          return showedResults;
        }

        if (autocompleteType == AC_TYPE.HASHTAG) {
          $.ajax({
            mode: "abort",
            port: "autocompletehashtag",
            dataType: options.dataType,
            url: "/ep/search/hashtags",
            data: {
              q: word.toLowerCase(),
            },
            success: function(data) {
              // if not currently autocompleting, cancel
              if (lastStart == null) {
                return;
              }
              processHashtagData(data);
              loadAndDisplayData(word);
              lastAutocompleteQuery.ajaxResults = true;
            }
          });
        } else if (autocompleteType == AC_TYPE.EMOJI) {
          // if not currently autocompleting, cancel
          if (lastStart == null) {
            return;
          }
          processEmojiData(linestylefilter.EMOJI_LIST);
          loadAndDisplayData(word);
          lastAutocompleteQuery.ajaxResults = true;
        } else {
          // autocompletemention
          $.ajax({
            // try to leverage ajaxQueue plugin to abort previous requests
            mode: "abort",
            // limit abortion to this input
            port: "autocompletemention",
            dataType: options.dataType,
            url: "/ep/invite/autocomplete",
            data: {
              padid: padId,
              ismention: true,
              userlink: true,
              q: word.toLowerCase(),
              limit: options.max-1,
              excludefacebook: true,
              isatless: (autocompleteType == AC_TYPE.ATLESS)
            },
            success: function(data) {
              // if not currently autocompleting, cancel
              if (lastStart == null) {
                return;
              }
              processInviteData(data, autocompleteType);
              loadAndDisplayData(word);
              lastAutocompleteQuery.ajaxResults = true;
            }
          });
        }

        // Only do search and dropbox if we have an explicit @ linking
        if (autocompleteType == AC_TYPE.AT) {

          function processDownloads(data) {
            data = data && data.data;
            if (!data || !data.length) { return; }
            data = data.split("\n")
            var parsed = [];
            for (var i=0; i < data.length; i++) {
              var parts = data[i].split("|");
              parsed.push([parts[0], parts[0], '/' + parts[1]]);
            }
            //console.log(parsed);
            options.dataPads = parsed;
            options.data = options.dataPeople.concat(options.dataPads).concat(options.dataFiles);
            cache.populate();
          }

          // searchautocomplete
          $.ajax({
            // try to leverage ajaxQueue plugin to abort previous requests
            mode: "abort",
            // limit abortion to this input
            port: "searchautocomplete",
            dataType: options.dataType,
            url: "/ep/search/autocomplete",
            data: { userlink: true, q: word.toLowerCase(), limit: options.max-1 },
            success: function(data) {
              // if not currently autocompleting, cancel
              if (lastStart == null) {
                return;
              }
              processDownloads(data);
              loadAndDisplayData(word);
            }
          });

          // autocompletedropbox
          if (clientVars['dropboxConnected'] && false) {
            var haveAllDBResults = cachedDropboxQueries[word.toLowerCase()] &&
              cachedDropboxQueries[word.toLowerCase()] < MAX_DROPBOX_RESULTS;
            if (!haveAllDBResults) {
              $.ajax({
                // try to leverage ajaxQueue plugin to abort previous requests
                mode: "abort",
                // limit abortion to this input
                port: "autocompletedropbox",
                url: "/ep/dropbox/files",
                data: {q: word.toLowerCase() },

                success: function(data) {

                  // if not currently autocompleting, cancel
                  if (lastStart == null) {
                    return;
                  }

                  processDropboxData(data, word.toLowerCase());
                  loadAndDisplayData(word);
                }
              });
            }
          }
        }
        cachedQueries[word.toLowerCase()] = true;
        return showedResults;
      }

      padeditor.ace.setTriggerLink(aceTriggerCallback);
      padeditor.ace.setAutocompleteCallback(aceAutocompleteCallback);
    },
    setAutocompleteHandler: function (handler) {
      autocompleteHandler = handler;
    }
  };
  return self;
}());
