/**
 * Maintains and updates the 'floating heads' on the page.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.ui.carets} The public methods to manipulate carets.
 */
ace.ui.carets = function(editor) {
  var currentCaretPosition = null;
  var root = editor.getRoot();
  var userCaretOffsetLeft = 32;

  function getCurrentCaretPosition() { return currentCaretPosition; }

  /**
   * Handler for when the user caret position is updated,
   * @param {boolean=} opt_force Forces a broadcast over the wire of the line #.
   * @return {boolean} Whether the current line was updated.
   */
  function onCaretUpdate(opt_force) {
    var updated = false;
    var rep = editor.getRep();

    if ((!clientVars.demoMode && clientVars.userId.indexOf('g.') == 0) ||
        // no carets for guests (slows down busy pads)
        $('.user-caret').length > 10) { // limit to 10 carets per pad.
      return updated;
    }

    if (rep.selStart) {
      var lineNo = rep.selStart[0];
      if (currentCaretPosition != lineNo || opt_force) {
        currentCaretPosition = lineNo;
        updated = true;
      }
    }

    // Show yourself only if someone else is in the room.
    var moreThanOneUser = $('.user-caret').length > 0;
    if ((moreThanOneUser || clientVars.demoMode )&& (updated ||
        !$('#user-caret-' + clientVars.userId.replace('.', '-')).
            is(':visible'))) {
      updateUserCaret(
          { changedBy: clientVars.userId, caret: currentCaretPosition },
          true /* force */);
    }

    return updated;
  }

  /**
   * Takes info about a single caret and renders/updates it.
   * @param {Object} msg Contains data pertaining to the caret.
   * @param {boolean=} opt_force Whether to force an update.
   */
  function updateUserCaret(msg, opt_force) {
    var rep = editor.getRep();
    var authorInfos = editor.getAuthorInfos();

    if (!authorInfos[msg.changedBy] || msg.caret == null) {
      return;
    }
    if (msg.changedBy.indexOf('g.') == 0 && !clientVars.demoMode) {
      return; // no carets for guests (slows down busy pads)
    }
    if (!opt_force && msg.changedBy == clientVars.userId) {
      return; // ignore caret updates from yourself in other tabs.
    }
    if (msg.caret >= rep.lines.length()) {
      return; // caret is on a line that doesn't exist anymore
    }

    var caretId = '#user-caret-' + msg.changedBy.replace('.', '-');
    var caret = $(caretId);
    var isNewCaret = false;

    // Create a new caret.
    if (!caret.length) {
      // TODO: prolly not the cleanest way to get the photo.
      var authorPic = '/static/img/nophoto.png';
      var authorLink = '';
      if (msg.changedBy == clientVars.userId) {
        authorPic = clientVars.userPic || '/static/img/nophoto.png';
        authorLink = clientVars.userLink;
      } else {
        for (var x = 0; x < clientVars.invitedUserInfos.length; ++x) {
          if (clientVars.invitedUserInfos[x].userId == msg.changedBy) {
            authorPic = clientVars.invitedUserInfos[x].userPic ||
                '/static/img/nophoto.png';
            authorLink = clientVars.invitedUserInfos[x].userLink;
            break;
          }
        }
      }

      var imgEl = $('<img>').attr('src', authorPic);
      var authorName = authorInfos[msg.changedBy].name.split(' ')[0];
      var nameEl = $('<span>').
          addClass('user-caret-lbl').
          addClass('initials-shown').
          text(authorName);
      var initials = authorInfos[msg.changedBy].name.split(' ');
      var initialsEl = $('<span>').addClass('user-caret-initials').
          text((initials[0][0] || '') +
              (initials.length >= 2 ?
                  (initials[initials.length - 1][0] || '') : '')).
          css('opacity', '0');
      caret = $('<span>').attr('id', caretId.substring(1)).
          addClass('user-caret').
          addClass(linestylefilter.getAuthorClassName(msg.changedBy)).
          data('name', authorName).
          data('userId', msg.changedBy).
          attr('title', authorInfos[msg.changedBy].name).
          append(imgEl).
          append(nameEl).
          append(initialsEl).
          appendTo('#padeditor');

      imgEl.css('border-color', authorInfos[msg.changedBy].bgcolor);
      nameEl.css('background-color', authorInfos[msg.changedBy].bgcolor);
      initialsEl.css('background-color', authorInfos[msg.changedBy].bgcolor);
      //if (authorLink) {
        //caret.attr('href', authorLink);
      //}
      /*var blinkInterval = window.setInterval(function() {
        var bgColor = authorInfos[msg.changedBy].bgcolor;
        var blurAndSpread = imgEl.hasClass('blink') ? " 0 0 " : " 9px 1px ";
        var boxShadow = "0 0" + blurAndSpread + bgColor;
        imgEl.css('box-shadow', boxShadow).toggleClass('blink');
      }, 1000);
      caret.data('cursorEffect', blinkInterval);*/
      isNewCaret = true;
      window.setTimeout(function() { caret.fadeIn(); },
          300 /* Longer than the top/left transition. */ );
    }

    // Reposition the caret.
    var offset = $(root).offset();
    var line = rep.lines.atIndex(msg.caret);
    var windowTop = getUserCaretWindowTop();
    var windowBottom = getUserCaretWindowBottom();
    if (line) {
      // Heh.
      var caretTop = $(line.lineNode).offset().top +
          $(line.lineNode).height() / 2 + (browser.phone ? -9 : -19);
      var caretLeft = offset.left - userCaretOffsetLeft;
      var offScreenTop = caretTop < windowTop;
      var offScreenBottom = caretTop > windowBottom;
      caret.
          show().
          data('theoreticalCaretTop', caretTop).
          data('realCaretTop', caretTop);
      if (!offScreenTop && !offScreenBottom) {
        caret.show().offset({'top': caretTop, 'left': caretLeft});
      }
      caret.find('img').css('margin-right', 0);
      caret.find('.user-caret-lbl').css('width', '120px');
    }

    updateAllCarets();

    if (isNewCaret) {
      caret.hide();
    }
  }

  /**
   * Get the upper boundary of our visible caret space, usually right below
   * the toolbar.
   * @return {number} .
   */
  function getUserCaretWindowTop() {
    var userCaretWindowTopBoundaryFuzz = clientVars.isDesktopApp ? 40 :
        7;
    return $(window).scrollTop() + (browser.mobile ? 5 :
        $('body > header').height() + userCaretWindowTopBoundaryFuzz);
  }

  /**
   * Get the lower boundary of our visible caret space.
   * @return {number} .
   */
  function getUserCaretWindowBottom() {
    var offset = $(root).offset();
    var userCaretHeaderStdHeight = 44;
    var userCaretWindowBottomBoundaryFuzz =
        $('body').hasClass('hasBanner') ? 200 : 100;

    // TODO: This is wacky depending on the screen - sigh.
    // Find a better way.
    return $(window).scrollTop() + $(window).height() -
        (browser.mobile ? 0 : userCaretHeaderStdHeight) +
        //($('#guestbanner').is(':visible') ?
        //    $('#guestbanner').outerHeight(true) : 0) +
        offset.top -
        (browser.mobile ? (browser.phone ? 30 /* iPhone. */ : 148 /* iPad. */) :
            (clientVars.isDesktopApp ? 10 :
                userCaretWindowBottomBoundaryFuzz));
  }

  /**
   * Performs more magic on the carets, like consolidating them if they're
   * on the same line or decorating them with arrows if they're offscreen.
   */
  function updateAllCarets() {
    var offset = $(root).offset();
    var windowTop = getUserCaretWindowTop();
    var windowBottom = getUserCaretWindowBottom();

    // Decorate carets that are offscreen.
    $.each($('.user-caret'), function(index, el) {
      var caretEl = $(el);
      var caretTop = caretEl.data('theoreticalCaretTop');
      var caretLeft = offset.left - userCaretOffsetLeft;
      if (caretTop == undefined) {
        return;
      }
      var offScreenTop = caretTop < windowTop;
      var offScreenBottom = caretTop > windowBottom;
      caretEl.off('.user-caret');
      if (caretEl.data('userId') == clientVars.userId || !offScreenTop) {
        caretEl.removeClass('user-caret-offscreen-top');
      }
      if (caretEl.data('userId') == clientVars.userId || !offScreenBottom) {
        caretEl.removeClass('user-caret-offscreen-bottom');
      }
      if (offScreenTop || offScreenBottom) {
        caretTop = offScreenTop ? windowTop : windowBottom;
        caretEl.data('realCaretTop', caretTop).
            show().
            addClass(offScreenTop ? 'user-caret-offscreen-top' :
                'user-caret-offscreen-bottom').
            addClass('user-caret-transition-off').
            offset({'top': caretTop, 'left': caretLeft});
        caretEl.on('click.user-caret', function() {
          $(window).scrollTop(
              Math.max(0, caretEl.data('theoreticalCaretTop') -
                  offset.top - 75));
        });
      } else {
        caretEl.data('realCaretTop', caretEl.data('theoreticalCaretTop')).
            show().
            offset({'top':
                caretEl.data('theoreticalCaretTop'), 'left': caretLeft});
        window.setTimeout(function() {
          caretEl.removeClass('user-caret-transition-off');
        }, 0);
      }
    });

    // Go through carets that are on the same line and arrange them.
    var caretsPerLine = {};
    $.each($('.user-caret'), function(index, el) {
      el = $(el);
      var caretOffsetTop = el.data('realCaretTop');
      if (caretOffsetTop == undefined) {
        return;
      }
      if (!caretsPerLine[caretOffsetTop]) {
        caretsPerLine[caretOffsetTop] = [];
      }
      caretsPerLine[caretOffsetTop].push(el);
    });
    $.each(caretsPerLine, function(key, carets) {
      if (carets.length > 1) {
        var offsetPixels = browser.mobile ? 10 : 24;
        var offset = -1 * offsetPixels;
        for (var x = 0; x < carets.length; ++x) {
          offset += offsetPixels;
          carets[x].find('img').css('margin-right', offset + 'px');
          carets[x].find('.user-caret-initials').
              css('margin-right', offset + 'px').
              css('opacity', '1');
        }

        for (var x = 0; x < carets.length; ++x) {
          carets[x].find('.user-caret-lbl').
              css('width',  Math.max(0, 120 - offset) + 'px').
              addClass('initials-shown');
              //text('');
        }
      } else if (carets.length == 1) {
        carets[0].find('img').css('margin-right', 0);
        carets[0].find('.user-caret-lbl').css('width', '120px');
        carets[0].find('.user-caret-lbl').
            removeClass('initials-shown');
            //text(carets[0].data('name'));
        carets[0].find('.user-caret-initials').
            css('margin-right', 0).
            css('opacity', '0');
      }
    });
  }

  /**
   * Removes a caret of a user that has left the room.
   * @param {Object} msg Contains info on the caret that was removed.
   */
  function removeUserCaret(msg) {
    var caretId = '#user-caret-' + msg.userId.replace('.', '-');
    var caret = $(caretId);
    if (caret.length) {
      window.clearInterval(caret.data('cursorEffect'));
      caret.fadeOut(undefined, function() {
        caret.remove();

        // We're the last ones in the room, how sad. Remove your own caret.
        if ($('.user-caret').length == 1 &&
            $('.user-caret')[0].id == 'user-caret-' +
            clientVars.userId.replace('.', '-') &&
            !clientVars.demoMode) {
          removeUserCaret({ userId: clientVars.userId });
        }
      });
    }
  }


  return {
    getCurrentCaretPosition: getCurrentCaretPosition,
    onCaretUpdate: onCaretUpdate,
    removeUserCaret: removeUserCaret,
    updateAllCarets: updateAllCarets,
    updateUserCaret: updateUserCaret
  };
};
