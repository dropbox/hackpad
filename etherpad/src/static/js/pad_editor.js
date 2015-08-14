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


var padeditor = (function(){
  var self = {
    ace: null, // this is accessed directly from other files
    aceObserver: null,
    init: function(readyFunc, initialViewOptions) {
      self.aceObserver = new ace.observer();
      self.ace = new ace.editor('#editor', self.aceObserver);

      $("#editorloadingbox").hide();

      $("#padeditor").addClass("loaded");

      if (clientVars.isEmbed) {
        self.ace.setProperty("min-height", 360);
      } else {
        _setMinHeight();
        $(window).resize(_setMinHeight);
      }

      if (readyFunc) {
        readyFunc();
      }

      if (clientVars.isEmbed || !padutils.getIsMobile()) {
        $("#editorbottombox").show();
      }

      self.ace.setProperty("notitle", pad.getTitleIsReadOnly());

      // enable event tracking
      self.aceObserver.on('track', function(evt, eventName, action, label,
          extras) {
        extras = extras || {};
        extras.isEmbed = !!clientVars.isEmbed;
        trackEvent('ace_' + eventName, action, label, extras);
      });

      if (navigator.userAgent.toLowerCase().indexOf('iphone') != -1 ||
          navigator.userAgent.toLowerCase().indexOf('android') != -1) {
        self.ace.setShortNames("initials");
      } else if (navigator.userAgent.toLowerCase().indexOf('ipad') != -1) {
        self.ace.setShortNames("firstname-lastinitial");
      }
      if (!padutils.getIsMobile()) {
        if ($('body').hasClass('embed')) {
          self.ace.setShortNames("fullname");
        } else if (clientVars.isDesktopApp) {
          self.ace.setShortNames("initials");
        } else {
          self.ace.setShortNames("firstname-lastinitial");
        }
      }

      self.aceObserver.on('height-change', function(evt, height) {
        // message the top window in case we're embedded
        if (clientVars.isEmbed) {
          top.postMessage("hackpad-" + encodeURIComponent(pad.getPadId()) +
              ":height:" + height, "*");
        }
      });

      var _lastMinHeight = -1;
      function _setMinHeight() {
        var newHeight = $(window).height() - $("#editor").offset().top;
        if (padutils.getIsMobile()) {
          // always at least the height of the window without iPhone nav bar
          newHeight = Math.max(newHeight, $(window).height() -
              $("#padbar").height() + 45);
        } else {
          // show the actions at the bottom of the pad
          newHeight -= 46;
        }
        if (clientVars.isDesktopApp) {
          newHeight -= 5;
        }
        if (newHeight != _lastMinHeight) {
          self.ace.setProperty("min-height", newHeight);
          _lastMinHeight = newHeight;
        }
      }

      if (pad.getIsDebugEnabled()) {
        self.ace.setProperty("dmesg", pad.dmesg);
      }
      self.setViewOptions(initialViewOptions);

      self.aceObserver.on('missing-authors', function(event, list) {
        $.ajax({
          url: '/ep/pad/add-authors',
          type: 'post',
          data: {list: list.join("|"), padId:pad.getPadId() },
          success: function(data) {
            pad.addHistoricalAuthors(data);
          }
        });
      });
    },
    setViewOptions: function(newOptions) {
      function getOption(key, defaultValue) {
        var value = String(newOptions[key]);
        if (value == "true") return true;
        if (value == "false") return false;
        return defaultValue;
      }
      var v;

      v = getOption('showLineNumbers', false);
      self.ace.setProperty("showslinenumbers", v);
      //padutils.setCheckbox($("#options-linenoscheck"), v);

      v = getOption('showAuthorColors', true);
      self.ace.setProperty("showsauthorcolors", v);
      //padutils.setCheckbox($("#options-colorscheck"), v);

      v = getOption('useMonospaceFont', false);
      self.ace.setProperty("textface",
          (v ? "monospace" :
              clientVars.isDesktopApp ?
              'Helvetica, Arial, sans-serif' :
              "ProximaNova-Light, nova, arial, sans-serif"));
      self.ace.setProperty("textsize", (v ? "12" : "14"));
      //$("#viewfontmenu").val(v ? "monospace" : "normal");
    },
    dispose: function() {
      if (self.ace) {
        self.ace.dispose();
      }
    },
    disable: function() {
      if (self.ace) {
        self.ace.setProperty("grayedOut", true);
        self.ace.setEditable(false);
      }
    },
    restoreRevNum: function(revNum) {
      $.post('/ep/pad/saverevision', {
        padId: pad.getPadId(),
        savedBy: pad.getUserName() || "unnamed",
        savedById: pad.getUserId(),
        revNum: revNum
      }, function(data) {
        console.log(data);
        for (var i = 0; i < data.length; i++) {
          if (data[i].revNum == String(revNum)) {
            padeditor.restoreRevisionId(data[i].id);
            break;
          }
        }
      });
    },
    restoreRevisionId: function(revId) {
      $.ajax({
        type: 'get',
        url: '/ep/pad/getrevisionatext',
        data: {padId: pad.getPadId(), revId: revId},
        success: success,
        error: error
      });
      function success(resultJson) {
        var result = JSON.parse(resultJson);
        padeditor.restoreRevisionText(result);
      }
      function error(e) {
        alert("Oops!  There was an error retreiving the text (revNum= " +
          rev.revNum + "; padId=" + pad.getPadId());
      }
    },
    restoreRevisionText: function(dataFromServer) {
      pad.addHistoricalAuthors(dataFromServer.historicalAuthorData);
      self.ace.importAText(dataFromServer.atext, dataFromServer.apool, true);
    },

    // iOS specific.
    setVisibleHeight: function (height) {
      if (!height) {
        return;
      }
      self.ace.setVisibleHeight(height);
      self.ace.callWithAce(function (ace) {
        if (ace.scrollSelectionIntoView) {
          ace.scrollSelectionIntoView();
        }
      });
    }
  };
  return self;
}());

