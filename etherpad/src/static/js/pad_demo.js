var paddemo = {
  demoModeOn: false,

  hpTeam : { colorId: 1,
    name: "Julia",
    status: "connected",
    userId: 'p.12345',
    userLink: "/ep/profile/XXXXXXXXX",
    userPic: ""
  },

  script : [
    {text: 'Julia from the Hackpad team here.  Try typing something below to work with me on this document.  \n\n\n\n\n\n\n\n\n\n\n', line: 2},
    {text: 'Great!  Now let\'s try some fun stuff.  Type // (followed by a space) at the beginning of a line to make a comment.  ', line: 3},
    {text: 'Thanks for the comment!  Try typing [ ] (followed by a space) at the beginning of a line.  ', line: 4},
    {text: 'You just made a checkbox to keep track of progress. Try copying this link and pasting it in the pad.  ', line: 5,
        postText: function() {
          setTimeout(function() {
            $('<input id="demo-link" type="text" value="https://dchtm6r471mui.cloudfront.net/hackpad.com_jzlYee5r2gk_p.1_1386024406749_bmo-adventure-time.gif">').
                css({
                  'font-size': '14px',
                  'width': '300px',
                  'position': 'fixed',
                  'top': '300px',
                  'left': '500px',
                  'z-index': '100000',
                  'border': '1px solid #ccc',
                  'padding': '5px',
                  'box-shadow': '1px 1px #99e'
                }).
                on('click', function() { this.focus(); this.select(); }).
                appendTo($('body'))
          }, 2500);
        }
    },
    {text: 'I think you\'re getting the hang of it!  There\'s even more features like tables, lists, code highlighting.  Come sign in, take off your shoes.', line: 6,
        preText: function() {
          $('#demo-link').remove();
        },
        postText: function() {
          setTimeout(function() {
            modals.showHTMLModal($("#page-login-box"));
          }, 15000);
        }},
  ],
  scriptPosition: 0,

  start: function() {
    paddemo.demoModeOn = true;
    padeditor.aceObserver.on('keypress', paddemo.onKeyPress);
    trackEvent('demo-init');

    pad.handleUserJoin(paddemo.hpTeam);
    padeditor.ace.setAuthorInfo(paddemo.hpTeam.userId, {bgcolor: clientVars.colorPalette[paddemo.hpTeam.colorId % clientVars.colorPalette.length], name: paddemo.hpTeam.name, userLink: paddemo.hpTeam.userLink});
    paddemo.type(paddemo.script[0].text, paddemo.script[0].line);

    setInterval(paddemo.checkProgress, 1000);
  },

  type: function(text, line, pos) {
    function getRandom(min, max) {
      return Math.random() * (max - min) + min;
    }

    pos = pos || 0;

    try {
      setTimeout(function() {
        padeditor.ace.callWithAce(function (ace) {
          var atext = ace.getBaseAttributedText();
          var startAtChar = 0;
          for (var x = 0; x < line; ++x) {
            startAtChar = atext.text.indexOf('\n', startAtChar + 1);
          }
          startAtChar++;

          ace.applyChangesToBase(
              Changeset.makeSplice(
                  atext.text,
                  startAtChar + pos,
                  0,
                  text[pos],
                  [['author', paddemo.hpTeam.userId]],
                  ace.getRep().apool),
              paddemo.hpTeam.userId,
              ace.getRep().apool);
        }, 'demotext', false);

        ++pos;
        if (pos < text.length) {
          paddemo.type(text, line, pos);
        }
      }, getRandom(10, 33) + (text[pos].match(/\s/) ? getRandom(25, 50) : 0));
    } catch (e) {};

    if (!pos) {
      setTimeout(function() {
        var lineEl = $($('.' + linestylefilter.getAuthorClassName(paddemo.hpTeam.userId))[line - 2]).parents('.ace-line');
        var lineNumber = lineEl.parent().children().index(lineEl);
        pad.handleClientMessage({type: "caret", caret: lineNumber, changedBy: paddemo.hpTeam.userId});
      }, 33);
    }
  },

  eventHandler: function() {
    var demoPosition = ++paddemo.scriptPosition;
    setTimeout(function() {
      setTimeout(function() {
        paddemo.script[demoPosition].preText && paddemo.script[demoPosition].preText();
        paddemo.type(paddemo.script[demoPosition].text,
            paddemo.script[demoPosition].line);
        paddemo.script[demoPosition].postText && paddemo.script[demoPosition].postText();
      }, 2000);
    }, 250);
  },

  checkProgress: function() {
    var authorClass = '.' + linestylefilter.getAuthorClassName(clientVars.userId);
    if (paddemo.scriptPosition == 0 && paddemo.everPressed ||
        paddemo.scriptPosition == 1 && $('.list-comment1 ' + authorClass).length ||
        paddemo.scriptPosition == 2 && $('.list-task1 ' + authorClass).length ||
        paddemo.scriptPosition == 3 && $('.ace-line ' + authorClass + ' .inline-img').length) {
      trackEvent('demo-' + paddemo.scriptPosition);
      paddemo.eventHandler();
    }
  },

  everPressed: false,
  onKeyPress: function(evt) {
    if (!paddemo.demoModeOn) {
      return;
    }

    if (!paddemo.everPressed) {
      paddemo.everPressed = true;
    }
  }
};
