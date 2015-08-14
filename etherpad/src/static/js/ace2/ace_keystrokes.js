/**
 * Handles any keystrokes going through the Ace editor and transforms them
 * as necessary into fancy features.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.keystrokes} The public methods to hook into the keystrokes
 *     handler.
 */
ace.keystrokes = function(editor) {
  var THE_TAB = '    '; // 4 spaces.
  var thisKeyDoesntTriggerNormalize = false;
  var observer = editor.getObserver();

  /**
   * Ostensibly, this seems to be used to turn off inline author coloring
   * temporarily when copying/pasting.
   * @type {boolean}
   */
  var authorColorsTempDisabled = false;

  /**
   * Cache of keys sent by Android so that we can workaround that platform's
   * limitations.
   * @type {Array.<number>}
   */
  var previousKeyPressCharCodes = [];

  var macros = [{
      listType: "comment",
      text: "//",
      allowed: function() { return !editor.isMonospace() }
    }, {
      text: "[]",
      listType: "task"
    }, {
      text: "[ ]",
      listType: "task"
    }, {
      text: "- ",
      listType: "bullet",
      allowed: function() { return !editor.isMonospace() }
    }, {
      text: "# ",
      listType: "hone",
      allowed: function() { return !editor.isMonospace() }
    }, {
      text: "## ",
      listType: "htwo",
      allowed: function() { return !editor.isMonospace() }
    }, {
      text: "### ",
      listType: "hthree",
      allowed: function() { return !editor.isMonospace() }
    }, {
      text: "* ",
      listType: "bullet",
      allowed: function() { return !editor.isMonospace() }
    }, {
      charRegexp: [/\d/, /\./, / /],
      regexp: /^\d\. /,
      listType: "number"
    }, {
      charRegexp: [/\d/, /\d/, /\./, / /],
      regexp: /^\d\d\. /,
      listType: "number"
    }, {
      text: "    ",
      listType: "code",
      allowed: function() { return !editor.isMonospace() }
    }
  ];

  var macroStateMachine = {
    searchSet: macros,
    nextCharIndex: 0
  };

  /**
   * Handles the basic interaction of a keystroke event.
   * @param {Event} evt .
   */
  function onKeyEvent(evt) {
    if (!editor.getIsEditable()) return;

    var type = evt.type;
    var charCode = evt.charCode;
    var keyCode = evt.keyCode;
    var which = evt.which;

    // XXX Android has a ***** up keydown event.
    // https://code.google.com/p/chromium/issues/detail?id=118639
    // We work around it by trying to see what the last character was typed in.
    // The problem stems from the fact that keyCode/charCode/which are all 0.
    // Woo.
    var isAndroidEvent = false;
    if (evt.which == 0 && browser.android) {
      var selection = editor.getSelection();
      if (selection && selection.startPoint && selection.startPoint.index > 0) {
        isAndroidEvent = true;
        var newChar = selection.startPoint.node.nodeValue[
            selection.startPoint.index - 1];
        which = charCode = keyCode = newChar.charCodeAt(0);
        if (which == 160) { // spacebar
          which = 32;
        } else if (which == 46) {
          which = 190;  // Match keyCode for period '.'
        }
      }

      if (type == 'keyup') {
        previousKeyPressCharCodes.push(which);
      }

      // We only want keyup events for macros and we want
      // key events for @-linking.  Ignore everything else currently.
      if (evt.type != 'keyup' && String.fromCharCode(charCode) != '@') {
        return;
      }
    } else if (type == 'keypress') {
      // Only the keypress event has the charCode - sometimes we need this in
      // the keyup event so we cache it for the next event.  They don't come in
      // order necessarily (e.g. keydown, keypress, keydown, keypress, keyup,
      // keyup)
      previousKeyPressCharCodes.push(charCode);
    }

    // re-activate styles on key up if disabled; doing this
    // before the isModKey check because that may block us if we
    // release the control key second
    if (type == "keyup" && authorColorsTempDisabled) {
      setClassPresence(editor.getRoot(), "authorColors", true);
      authorColorsTempDisabled = false;
    }

    // Don't take action based on modifier keys going up and down.
    // Modifier keys do not generate "keypress" events.
    // 224 is the command-key under Mac Firefox.
    // 91 is the Windows key in IE; it is ASCII for open-bracket but isn't the
    // keycode for that key
    // 20 is capslock in IE.
    var isModKey = ((!charCode) &&
        ((type == "keyup") || (type == "keydown")) &&
        (keyCode == 16 || keyCode == 17 || keyCode == 18 ||
            keyCode == 20 || keyCode == 224 ||
            keyCode == 91));
    if (isModKey) return;

    var isTypeForSpecialKey = ((browser.msie || browser.safari) ?
        (type == "keydown") : (type == "keypress"));
    var isTypeForCmdKey = ((browser.msie || browser.safari) ?
        (type == "keydown") : (type == "keypress"));

    editor.inCallStack("handleKeyEvent", function() {
      var specialHandled = false;

      if (type == "keypress" ||
          (isTypeForSpecialKey && keyCode == 13)) { // return
        // in IE, special keys don't send keypress, the keydown does the action
        observer.trigger('keypress');
      }

      specialHandled = handleSpecialKeys(evt, type, charCode, keyCode, which,
          isAndroidEvent);
      if (!specialHandled) {
        specialHandled = handleMacros(evt, type, charCode, keyCode, which,
            isAndroidEvent);
      }

      if (type == "keydown") {
        editor.getIdleWorkTimer().atLeast(500);
      } else if (type == "keypress") {
        editor.getIdleWorkTimer().atLeast(500);
      } else if (type == "keyup") {
        var wait = 200;
        editor.getIdleWorkTimer().atLeast(wait);
        editor.getIdleWorkTimer().atMost(wait);
      }

      // Is part of multi-keystroke international character on Firefox Mac
      var isFirefoxHalfCharacter =
        (browser.mozilla && evt.altKey && charCode == 0 && keyCode == 0);

      // Is part of multi-keystroke international character on Safari Mac
      var isSafariHalfCharacter =
        (browser.safari && evt.altKey && keyCode == 229);

      if (thisKeyDoesntTriggerNormalize || isFirefoxHalfCharacter ||
          isSafariHalfCharacter) {
        editor.getIdleWorkTimer().atLeast(3000); // give user time to type
        // if this is a keydown, e.g., the keyup shouldn't trigger a normalize
        thisKeyDoesntTriggerNormalize = true;
      }

      if ((!specialHandled) && (!thisKeyDoesntTriggerNormalize) &&
          (!editor.getInInternationalComposition())) {
        if (type != "keyup" || !editor.incorpIfQuick()) {
          editor.observeChangesAroundSelection();
        }
      }

      if (type == "keyup") {
        thisKeyDoesntTriggerNormalize = false;
        previousKeyPressCharCodes.shift();
      }
    });
  }

  /**
   * Handles any special key combinations (usually of the form Cmd-<key>)
   * and performs any related actions.
   * @param {Event} evt .
   * @param {string} type The event type (keydown, keypress, etc.)
   * @param {number} charCode .
   * @param {number} keyCode .
   * @param {number} which .
   * @param {boolean} isAndroidEvent Whether this event was triggered by an
   *     Android device, which requires special hackery.
   */
  function handleSpecialKeys(evt, type, charCode, keyCode, which,
      isAndroidEvent) {
    var rep = editor.getRep();
    var isTypeForSpecialKey = ((browser.msie || browser.safari) ?
        (type == "keydown") : (type == "keypress"));
    var isTypeForCmdKey = ((browser.msie || browser.safari) ?
        (type == "keydown") : (type == "keypress"));
    var ch = String.fromCharCode(which).toLowerCase();

    // Caching isCaretLineInCode implementation
    // (expensive-ish and called repeatedly)
    var _isCaretLineInCode = null;
    function isCaretLineInCode() {
      if (_isCaretLineInCode == null && editor.isCaret()) {
        var listType = editor.getLineListType(editor.caretLine());
        _isCaretLineInCode = editor.isMonospace() ||
            listType.indexOf("code") == 0;
      }
      return _isCaretLineInCode;
    }

    // Keystrokes that are performed while we are in an autolinking state,
    // either @-linking or emoji.
    var autolinkStartPos = editor.findAutolinkStartPosition();
    if (autolinkStartPos &&
        type == (browser.mozilla ? "keypress" : "keydown")) {
      var action = { 9: "enter", 13: "enter", 27: "cancel",
          38: "up", 40: "down"}[keyCode];
      if (action) {
        var word = editor.isValidLinkStart(autolinkStartPos) ?
            editor.linkWord(autolinkStartPos) : editor.caretWord();
        var position = editor.caretWordPopupPosition();
        var showedResults = editor.autocompleteCallback(
            word.word, action, word.start, word.end, position);

        if (showedResults) {
          editor.fastIncorp();
          evt.preventDefault();
          return true;
        } else if (action == "cancel") {
          // Clean up autolink marker on 'escape'
          editor.fastIncorp();
          editor.clearAutolink(autolinkStartPos);
          return true;
        }
      }
    }

    // Use keyboard to move line up and down.
    if (type == (browser.mozilla ? "keypress" : "keydown") && evt.altKey) {
      var action = {38: "up", 40: "down"}[keyCode];
      if (action) {
        var builder = Changeset.builder(rep.lines.totalWidth());
        var lastFullySelectedLine =
            ((rep.selStart[0] != rep.selEnd[0]) && (rep.selEnd[1] == 0)) ?
                rep.selEnd[0] - 1 : rep.selEnd[0];
        var performMove = false;
        if (action == "up" && rep.selStart[0] > 0 &&
            lastFullySelectedLine < rep.lines.length() - 1) {
          // keep 0 to selTop - 1
          builder.keep(rep.lines.offsetOfIndex(rep.selStart[0] - 1),
              rep.selStart[0] - 1);

          // delete a row
          builder.remove(rep.lines.atIndex(
              rep.selStart[0] - 1).text.length + 1, 1);

          // keep all the select text
          for (var i = rep.selStart[0]; i <= lastFullySelectedLine; i++) {
            builder.keep(rep.lines.atIndex(i).text.length + 1, 1);
          }

          // insert the deleted row
          builder.insertAText({
              text: rep.lines.atIndex(rep.selStart[0] - 1).text,
              attribs: rep.alines[rep.selStart[0] - 1]});
          builder.insert("\n", [[]], rep.apool);

          performMove = true;
        } else if (action == "down" && lastFullySelectedLine <
            rep.lines.length() - 2) {
          // keep 0 to selTop
          builder.keep(rep.lines.offsetOfIndex(rep.selStart[0]),
              rep.selStart[0]);

          // insert the deleted row
          builder.insertAText({text: rep.lines.atIndex(
              lastFullySelectedLine + 1).text,
              attribs: rep.alines[lastFullySelectedLine + 1]});
          builder.insert("\n", [[]], rep.apool);

          // keep all the select text
          for (var i = rep.selStart[0]; i <= lastFullySelectedLine; i++) {
            builder.keep(rep.lines.atIndex(i).text.length + 1, 1);
          }

          // delete a row
          builder.remove(rep.lines.atIndex(
              lastFullySelectedLine + 1).text.length + 1, 1);

          performMove = true;
        }

        if (performMove) {
          editor.fastIncorp();
          rep = editor.getRep();
          var cs = builder.toString();
          if (!Changeset.isIdentity(cs)) {
            editor.performDocumentApplyChangeset(cs);
          }

          editor.performSelectionChange([rep.selStart[0], rep.selStart[1]],
              [rep.selEnd[0], rep.selEnd[1]], rep.selFocusAtStart);
          evt.preventDefault();

          return true;
        }
      }
    }

    // At-linking
    if (ch == '@' && (type == "keydown" || type == "keypress") &&
        (!isCaretLineInCode())) {
      var docChar = editor.caretDocChar() - 1;
      var precedingChar = rep.alltext.charAt(docChar);

      // Only trigger at-linking if preceded by whitespace.
      if (/\s/.test(precedingChar)) {
        editor.fastIncorp();
        rep = editor.getRep();

        observer.trigger('track', ['at-linking']);

        evt.preventDefault();
        editor.performDocumentReplaceRange(
            isAndroidEvent ? [rep.selStart[0],rep.selStart[1] - 1] :
            rep.selStart, rep.selEnd, '@', [['autolink', 'true']]);
        return true;
      }
    }

    // Hashtagging.
    // We need to check both 'which' and 'charCode' because the End key,
    // at least on Mac, translates to the # character.  However, End will have
    // a charCode of 0 (mercifully) to distinguish.
    if (ch == '#' && String.fromCharCode(charCode).toLowerCase() == '#' &&
        (type == "keydown" || type == "keypress") &&
        (!isCaretLineInCode())) {
      editor.fastIncorp();
      rep = editor.getRep();

      observer.trigger('track', ['hashtag']);

      evt.preventDefault();
      editor.performDocumentReplaceRange(rep.selStart, rep.selEnd, '#',
          [['autolink', 'true']]);
      return true;
    }

    // Emoji.
    if (!autolinkStartPos &&
        ch == ':' && (type == "keydown" || type == "keypress") &&
        (!isCaretLineInCode())) {
      var docChar = editor.caretDocChar() - 1;
      var precedingChar = rep.alltext.charAt(docChar);

      // Only trigger emoji if preceded by whitespace.
      if (/\s/.test(precedingChar)) {
        editor.fastIncorp();
        rep = editor.getRep();

        observer.trigger('track', ['emoji']);

        evt.preventDefault();
        editor.performDocumentReplaceRange(rep.selStart, rep.selEnd, ':',
            [['autolink', 'true']]);
        return true;
      }
    }

    // Detect an autocomplete prefix and mark the initial character with
    // an autolink attribute. Clear the marker if the current input is
    // incompatible with the autocomplete results
    if ((autolinkStartPos || editor.isWordChar(ch)) &&
          (type == "keypress" ||
          ((type == "keyup" || type == "keydown") &&
              // Backspace, left arrow, right arrow
          (which == 8 || which == 37 || which == 39))) &&
          (!isCaretLineInCode())) {
      editor.fastIncorp();

      var word;

      // If the caret is before the linkingStart, it is invalid and we
      // want to cancel out of the autocomplete
      if (editor.isCaret()) {
        if (editor.isValidLinkStart(autolinkStartPos)){
          word = editor.linkWord(autolinkStartPos);
        } else {
          word = editor.caretWord();
        }

        var currWord = word.word;
        // Append unincorporated character into the word;
        if (type == "keypress") {
          currWord += String.fromCharCode(which);
        }

        var trigger = editor.shouldTriggerLink(currWord, word.start);
        if (!autolinkStartPos && trigger && currWord[0] != ':') {
          observer.trigger('track', ['atless-linking']);
          editor.setAutolink(word.start, currWord);
          editor.getCurrentCallStack().isTriggeringAutocomplete = true;
          return true;
        } else if (autolinkStartPos) {
          // Here we check if we need to clear the autolink marker. This
          // needs to happen if
          // - the linking word no longer meets the criteria to trigger a
          // link
          // - the cursor has navigated away from the autocompleting
          // position (changed lines, moved to start of line)
          if (!trigger || autolinkStartPos[0] != word.start[0] ||
              autolinkStartPos[1] != word.start[1]) {
            editor.clearAutolink(autolinkStartPos);
            editor.autocompleteCallback(null);
            return true;
          }
        }
      }
    }

    // Delete key.
    if (isTypeForSpecialKey && keyCode == 8) {
      // On iOS we only run the custom handler when deleting at the
      // lineMarker otherwise autocomplete breaks.  This way we get correct
      // bullet handling and working autocomplete.
      var cursorAfterLineMarker = (editor.isCaret() && rep.selStart[1] ==
          rep.lines.atIndex(rep.selStart[0]).lineMarker);
      if (cursorAfterLineMarker) {
        // "delete" key; in mozilla, if we're at the beginning of a line,
        // normalize now,
        // or else deleting a blank line can take two delete presses.
        // --
        // we do deletes completely customly now:
        //  - allows consistent (and better) meta-delete behavior
        //  - normalizing and then allowing default behavior confused IE
        //  - probably eliminates a few minor quirks

        editor.fastIncorp();
        evt.preventDefault();
        doDeleteKey(evt);
        return true;
      }
    }

    // Return key.
    if (isTypeForSpecialKey && keyCode == 13) {
      // handle specially;
      // note that in mozilla we need to do an incorporation for proper
      // return behavior anyway.
      editor.fastIncorp();
      evt.preventDefault();
      doReturnKey(evt);
      window.setTimeout(function() { window.scrollBy(-100, 0); }, 0);
      return true;
    }

    // Cmd-E (highlight).
    if (isTypeForCmdKey && ch == "e" && testAccelKey(evt)) {
      editor.fastIncorp();
      evt.preventDefault();
      editor.toggleAttributeOnSelection("highlight");
      return true;
    }

    // Tab.
    if (isTypeForSpecialKey && keyCode == 9 && !testAccelKey(evt)) {
      editor.fastIncorp();
      evt.preventDefault();
      doTabKey(evt.shiftKey);
      return true;
    }

    // Copy/cut.
    if (type == "keydown" && (ch == "c" || ch == "x") && testAccelKey(evt)) {
      setClassPresence(editor.getRoot(), "authorColors", false);
      authorColorsTempDisabled = true;
    }

    // Undo.
    if (isTypeForCmdKey && ch == "z" && testAccelKey(evt)) {
      editor.fastIncorp();
      evt.preventDefault();
      if (evt.shiftKey) {
        editor.doUndoRedo("redo");
      } else {
        editor.doUndoRedo("undo");
      }
      return true;
    }

    // Redo.
    if (isTypeForCmdKey && ch == "y" && testAccelKey(evt)) {
      editor.fastIncorp();
      evt.preventDefault();
      editor.doUndoRedo("redo");
      return true;
    }

    // Bold, italics, underline.
    if (isTypeForCmdKey && _contains(["b", "i", "u"], ch) &&
        testAccelKey(evt)) {
      var attrConfig = {
          'b': {'command': 'bold'},
          'i': {'command': 'italic'},
          'u': {'command': 'underline'}};
      var command = attrConfig[ch].command;

      editor.fastIncorp();
      evt.preventDefault();

      editor.toggleAttributeOnSelection(command);

      return true;
    }

    // Cmd-\ for new task.
    if (isTypeForCmdKey && (which == 220 || ch == '\\') &&
        testAccelKey(evt)) {
      editor.fastIncorp();
      evt.preventDefault();
      editor.doInsertTaskList();
      return true;
    }

    // Ctrl-= (subscript), Ctrl-+ (superscript)
    if (isTypeForCmdKey && keyCode == 187 &&
        testAccelKey(evt) && !editor.isCaret()) {
      editor.fastIncorp();
      rep = editor.getRep();
      evt.preventDefault();
      // remove what we aren't applying
      editor.performDocumentApplyAttributesToRange(rep.selStart, rep.selEnd,
        [[evt.shiftKey ? 'subscript' : 'superscript', '']]);
      editor.toggleAttributeOnSelection(evt.shiftKey ? 'superscript' :
          'subscript');
      return true;
    }

    // Cmd-H (backspace).
    if (isTypeForCmdKey && ch == "h" && testAccelKey(evt)) {
      // most browsers handle this, though not firefox linux (oct '13)
      editor.fastIncorp();
      evt.preventDefault();
      doDeleteKey();
      return true;
    }

    // Cmd-S, save.
    if (isTypeForCmdKey && ch == "s" && testAccelKey(evt)) {
      evt.preventDefault();
      ace.util.doAlert('No worries! Hackpad auto-saves your work. ^_^');
      return true;
    }

    return false;
  }

  /**
   * Listens and handles any macros that we have available for the editor,
   * like // for commenting, [] for tasks, etc.
   * @param {Event} evt .
   * @param {string} type The event type (keydown, keypress, etc.)
   * @param {number} charCode .
   * @param {number} keyCode .
   * @param {number} which .
   * @param {boolean} isAndroidEvent Whether this event was triggered by an
   *     Android device, which requires special hackery.
   */
  function handleMacros(evt, type, charCode, keyCode, which, isAndroidEvent) {
    var specialHandled = false;

    if (type != 'keyup') {
      return;
    }

    var rep = editor.getRep();
    var matched = false;
    var charId = macroStateMachine.nextCharIndex;
    var searchSet = macroStateMachine.searchSet;
    macroStateMachine.searchSet = [];
    var previousKeyPressCharCode = previousKeyPressCharCodes[0];

    for (var i = 0; i < searchSet.length; i++) {
      if (!searchSet[i] || ('allowed' in searchSet[i] &&
          !searchSet[i].allowed()) ||
          !previousKeyPressCharCode) {
        // skip any macros we can't perform
        continue;
      }

      var charNum = rep.selStart[1];
      var lineNum = rep.selStart[0];
      var curLine = rep.lines.atIndex(lineNum);
      var lineMarker = curLine.lineMarker;

      function _charMatches(charOrRange, charToMatch) {
        if (typeof(charOrRange) == 'number') {
          return charOrRange == charToMatch;
        } else {
          return (charOrRange[0] <= charToMatch) && (charOrRange[1] >=
              charToMatch);
        }
      }

      // Is this the next char in this macro?
      if ((searchSet[i].text &&
          searchSet[i].text.charCodeAt(charId) ==
              previousKeyPressCharCode) ||
          (searchSet[i].charRegexp && String.fromCharCode(
              previousKeyPressCharCode).match(
                  searchSet[i].charRegexp[charId]))) {
        // Is this the last char?
        var macroLength = searchSet[i].text ? searchSet[i].text.length :
            searchSet[i].charRegexp.length;
        if (macroLength == charId + 1) {
          // Double check (in case of selection changes between keys).
          // Important that the rep be up to date for below check.
          editor.fastIncorp();
          rep = editor.getRep();
          curLine = rep.lines.atIndex(lineNum);

          function _macroMatches(macro, line) {
            if (macro.text) {
              var matchLength = macro.text.length;
              return line.text.substr(line.lineMarker, matchLength) ==
                  macro.text;
            } else if (macro.regexp) {
              return line.text.match(macro.regexp);
            }
          }

          if (_macroMatches(searchSet[i], curLine)) {
            // matched
            evt.preventDefault();
            specialHandled = true;

            // perform macro
            var currentListType = editor.getLineListType(lineNum);
            if (currentListType.indexOf("code") > -1) {
              // abort!
            } else {
              var currentListLevel = 1;
              if (currentListType) {
                currentListLevel = Number(/([a-z]+)([12345678])/.exec(
                    currentListType)[2]) + 1;
              }

              if (searchSet[i].listType == "htwo") {
                editor.performDocumentReplaceRange([lineNum, 0],
                    [lineNum, macroLength + lineMarker], " ");
                editor.performSelectionChange(
                    editor.markerfulLineAndChar(lineNum, 0),
                    editor.markerfulLineAndChar(lineNum, 1), true);
                editor.setAttributeOnLine(lineNum, "bold", true);
              } else if (searchSet[i].listType == "table") {
                editor.performDocumentReplaceRange([lineNum, 0],
                    [lineNum, macroLength + lineMarker], "*",
                    [['table', '123']]);
                editor.performSelectionChange(
                    editor.markerfulLineAndChar(lineNum + 1, 0),
                    editor.markerfulLineAndChar(lineNum + 1, 0), true);
              } else {
                editor.performDocumentReplaceRange([lineNum, 0],
                    [lineNum, macroLength + lineMarker], "");
                editor.setLineListType(lineNum,
                    searchSet[i].listType + currentListLevel);
              }
              observer.trigger('track', ['keyboard-macro',
                  searchSet[i].listType]);
            }
          }
          matched = true;
        } else {
          // matched so far, keep going
          macroStateMachine.searchSet.push(searchSet[i]);
        }
      }
    }

    if (!matched && macroStateMachine.searchSet.length) {
      macroStateMachine.nextCharIndex++;
    } else {
      // no matching macros left or have matched, reset
      macroStateMachine.searchSet = macros;
      macroStateMachine.nextCharIndex = 0;
    }

    return specialHandled;
  }

  /**
   * Checks if the Cmd or Ctrl key is pressed, depending on OS platform.
   * Note: we also check to see that altKey isn't pressed.  On polish computers,
   * for example - both ctrl and alt are 'pressed'.
   * Another product with similar problem:
   * https://github.com/xing/wysihtml5/issues/16
   * @return {boolean} The value of meta (command key) on Mac; otherwise,
   *      returns the value of the ctrl key.
   */
  function testAccelKey(event) {
    if (navigator.platform.match(/(ipod touch)|(ipad)|(iphone)|(mac)/i)) {
      return event.metaKey && !event.altKey;
    }
    return event.ctrlKey && !event.altKey;
  }

  /**
   * Handles the indentation followed by the Return/Enter key.
   */
  function handleReturnIndentation() {
    var rep = editor.getRep();

    // on return, indent to level of previous line
    if (editor.isCaret() && editor.caretLine() > 0) {
      var lineNum = editor.caretLine();
      var thisLine = rep.lines.atIndex(lineNum);
      var prevLine = rep.lines.prev(thisLine);
      // only if at beginning of line

      if (editor.caretColumn() == prevLine.lineMarker) {
        var prevLineText = prevLine.text.substr(prevLine.lineMarker);
        var theIndent = /^ *(?:)/.exec(prevLineText)[0];

        // XXX indent the next code looking line, should only happen in a code
        // block
        //if (/[\[\(\{:]\s*$/.exec(prevLineText)) theIndent += THE_TAB;

        var cs = Changeset.builder(rep.lines.totalWidth()).keep(
          rep.lines.offsetOfIndex(lineNum), lineNum).keep(
              prevLine.lineMarker,0).insert(
                  theIndent, [['author', editor.getThisAuthor()]],
                  rep.apool).toString();
        editor.performDocumentApplyChangeset(cs);
        editor.performSelectionChange(
            [lineNum, theIndent.length + thisLine.lineMarker],
            [lineNum, theIndent.length + thisLine.lineMarker]);
      }
    }
  }

  /**
   * Handles the Return/Enter key.
   * @param {Event} evt .
   */
  function doReturnKey(evt) {
    var rep = editor.getRep();

    if (!(rep.selStart && rep.selEnd)) {
      return;
    }

    function _isHeadingListType(listType) {
       return listType.indexOf("hone") > -1 ||
          listType.indexOf("htwo") > -1 ||
          listType.indexOf("hthree") > -1;
    }

    var lineNum = rep.selStart[0];
    var listType = editor.getLineListType(lineNum);

    // if this is a bullet/number/task/etc.
    if (listType && !_isHeadingListType(listType)) {
      if (lineNum + 1 < rep.lines.length()) {
        var isCode = listType.indexOf("code") == 0;
        var lineEntry = (lineNum > 0 && rep.lines.atIndex(lineNum));
        var prevLineEntry = (lineNum - 1 > 0 && rep.lines.atIndex(lineNum - 1));
        var prevLineBlank = (prevLineEntry && prevLineEntry.text.length ==
            prevLineEntry.lineMarker);
        var lineBlank = (lineEntry && lineEntry.text.length ==
            lineEntry.lineMarker);
        var atLineStart = (lineEntry && editor.isCaret() &&
            (rep.selStart[1] == lineEntry.lineMarker));

        // TODO: for each previous non-empty line (non indent?)
        //       if has a list with level < current line level
        //       apply list type

        if (evt.shiftKey) {
          editor.performDocumentReplaceSelection('\n');
          var secondLevel = listType.match(/[2-9]$/);
          secondLevel = secondLevel ? Number(secondLevel[0]) : null;
          editor.setLineListType(lineNum+1, secondLevel ?
              'indent' + secondLevel : null);
        } else if (isCode ? prevLineBlank && lineBlank : lineBlank) {
          if (listType.indexOf("indent") == 0) {
            doDeleteKey();
          } else {
            editor.doIndentOutdent(true, true);
          }
        } else if (atLineStart) {
          // special handling for hitting enter at the beginning of a bullet
          // results in:
          // 1.
          // 2.cursor
          editor.performDocumentReplaceSelection('\n');
          listType = listType.replace("taskdone", "task");
          editor.setLineListType(lineNum, listType);
        } else {
          editor.performDocumentReplaceSelection('\n');
          listType = listType.replace("taskdone", "task");
          editor.setLineListType(lineNum + 1, listType);
        }
      }

      if (isCode) {
        var lang = editor.getLangForCodeLine(lineNum);
        if (lang) {
          editor.performDocumentApplyAttributesToRange(
              [lineNum + 1, 0], [lineNum + 1, 1],
              [['lang', lang]]);
        }

        handleReturnIndentation();
      }
    } else {
      editor.performDocumentReplaceSelection('\n');
      handleReturnIndentation();
    }
  }

  /**
   * Handles the Tab key.
   * @param {boolean} shiftDown Whether shift is pressed or not.
   */
  function doTabKey(shiftDown) {
    var rep = editor.getRep();
    var lineText = rep.lines.atIndex(editor.caretLine()).text;
    var isPrompt = editor.getLineListType(editor.caretLine()).
        indexOf("code") == 0;

    if ((!shiftDown && (editor.isMonospace() || isPrompt)) ||
        (!editor.doIndentOutdent(shiftDown) && !shiftDown)) {
      editor.performDocumentReplaceSelection(THE_TAB, true);
    }
  }

  /**
   * Handles the Delete/Backspace key.
   * @param {Event=} opt_evt .
   */
  function doDeleteKey(opt_evt) {
    var rep = editor.getRep();
    var evt = opt_evt || {};
    var handled = false;

    if (rep.selStart) {
      if (editor.isCaret()) {
        var lineNum = editor.caretLine();
        var col = editor.caretColumn();
        var lineEntry = rep.lines.atIndex(lineNum);
        var lineText = lineEntry.text;
        var lineMarker = lineEntry.lineMarker;
        if (/^ +$/.exec(lineText.substring(lineMarker, col))) {
          var col2 = col - lineMarker;
          var tabSize = THE_TAB.length;
          var toDelete = ((col2 - 1) % tabSize) + 1;
          editor.performDocumentReplaceRange([lineNum, col - toDelete],
              [lineNum, col], '');
          //scrollSelectionIntoView();
          handled = true;
        }
      }

      if (!handled) {
        if (editor.isCaret()) {
          var theLine = editor.caretLine();
          var lineEntry = rep.lines.atIndex(theLine);
          if (editor.caretColumn() <= lineEntry.lineMarker) {
            // Delete at beginning of line.
            var action = 'delete_newline';
            var prevLineListType =
                (theLine > 0 ? editor.getLineListType(theLine - 1) : '');
            var thisLineListType = editor.getLineListType(theLine);
            var prevLineEntry = (theLine > 0 &&
                rep.lines.atIndex(theLine - 1));

            if (thisLineListType) {
              // switch to indent and drop indent level
              var secondLevel = thisLineListType.match(/[2-9]$/);
              secondLevel = secondLevel ? Number(secondLevel[0]) - 1 : null;
              editor.setLineListType(theLine,
                  secondLevel ? "indent" + secondLevel : null);
            } else if (theLine > 0) {
              if (prevLineEntry.text == "*" &&
                  editor.getLineHasMagicObject(theLine - 1)) {
                // remove img/embed/table on previous line
                editor.performDocumentReplaceRange([theLine - 1,
                    0 /* prevLineEntry.text.length */ ],
                    [theLine, 0], '');
              } else {
                // remove newline
                editor.performDocumentReplaceRange(
                    [theLine - 1, prevLineEntry.text.length],
                    [theLine, 0], '');
              }
            }
          } else {
            var docChar = editor.caretDocChar();
            if (docChar > 0) {
              if (evt.metaKey || evt.ctrlKey || evt.altKey) {
                // delete as many unicode "letters or digits" in a row as
                // possible; always delete one char, delete further even if
                // that first char isn't actually a word char.
                var deleteBackTo = docChar - 1;
                while (deleteBackTo > lineEntry.lineMarker &&
                    editor.isWordChar(rep.alltext.charAt(deleteBackTo - 1))) {
                  deleteBackTo--;
                }
                editor.performDocumentReplaceCharRange(deleteBackTo,
                    docChar, '');
              } else {
                // normal delete
                editor.performDocumentReplaceCharRange(docChar - 1,
                    docChar, '');
              }
            }
          }
        } else {
          editor.performDocumentReplaceSelection('');
        }
      }
    }

    // If the list has been removed, it is necessary to renumber
    // starting from the *next* line because the list may have been
    // separated. If it returns null, it means that the list was not cut, try
    // from the current one.
    var line = editor.caretLine();
    if (line != -1 && editor.renumberList(line + 1) == null) {
      editor.renumberList(line);
    }
  }

  // Used by iOS.  TODO: these events from iOS seem unused maybe?
  observer.on('return-key', function(customEvent) {
    doReturnKey({});
  });
  observer.on('delete-key', function(customEvent) {
    doDeleteKey({});
  });

  // Public methods.
  return {
    onKeyEvent: onKeyEvent
  }
};
