/**
 * Manages the editor's autolink capability.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.autolink} The public methods to hook into the autolink manager.
 */
ace.autolink = function(editor) {
  var lastAutolinkPosition = null;

  /**
   * @return {number=} The last marker starting the beginning of an autolink
   *     section.
   */
  function getLastAutolinkPosition() {
    return lastAutolinkPosition;
  }

  var autocompleteCallback_ = function(word, action, start, end, position) {};

  /**
   * Called when typing an autolink section.
   * @param {string} word .
   * @param {string} action Can be up, down, cancel, enter to show what UI
   *     event triggered this callback.
   * @param {Object} start An object representing the beginning of the word.
   * @param {Object} end An object representing the end of the word.
   * @param {number} position Our position within that word.
   * @return {boolean} Whether we showed any results or not.
   */
  function autocompleteCallback(word, action, start, end, position) {
    return autocompleteCallback_(word, action, start, end, position);
  }

  /**
   * Sets the callback for the autocomplete handler mentioned above.
   */
  function setAutocompleteCallback(handler) {
    autocompleteCallback_ = handler;
  }

  var shouldTriggerLink_ = function(word, start) { return word[0] == '@'; }

  /**
   * Figures out whether we should start an autocomplete section or not.
   * @param {string} word .
   * @param {Object} start An object representing the beginning of the word.
   * @return {boolean} Whether wes should start an autocomplete or not.
   */
  function shouldTriggerLink(word, start) {
    return shouldTriggerLink_(word, start);
  }

  /**
   * Sets the callback for the trigger method mentioned above.
   */
  function setTriggerLink(handler) {
    shouldTriggerLink_ = handler;
  }

  /**
   * Sets an autolink marker at point in the text.
   * @param {Object} pos Represents the beginning of the word.
   * @param {boolean} triggeringWord TODO: seems unused?
   */
  function setAutolink(pos, triggeringWord) {
    console.log("Set marker at", pos);
    editor.performDocumentApplyAttributesToRange(pos, [pos[0], pos[1] + 1],
        [['autolink', 'true']]);
  }

  /**
   * Sets the last known autolink position.
   * @param {Object} pos Represents the beginning of a word.
   */
  function setLastAutolinkPosition(pos) {
    lastAutolinkPosition = pos;
  }

  /**
   * Clears the autolink at a given position.
   * @param {Object} Represents the beginning of a word where an autolink is.
   */
  function clearAutolink(pos) {
    console.log("Clear marker at", pos);
    lastAutolinkPosition = null;

    // Make sure there is still an autolink marker before we clear it
    pos = findAutolinkStartPosition(pos[0]);
    if (!pos) {
      console.log("No autolink marker found!");
      return;
    }

    editor.performDocumentApplyAttributesToRange(pos, [pos[0], pos[1] + 1],
        [['autolink', null]]);
  }

  /**
   * Finds an autolink on a given line.
   * @param {number} line .
   * @return {Array.<number, number>=} The line and column of where the autolink
   *     is, if any.
   */
  function findAutolinkStartPosition(line) {
    if (!editor.isCaret()) {
      return;
    }

    var rep = editor.getRep();
    var autolinkAttrNum = rep.apool.attribToNum[['autolink', 'true']];
    var currCaretLine = line || editor.caretLine();
    var caretAttrLine = rep.alines[currCaretLine];
    var opIter = Changeset.opIterator(caretAttrLine);
    var autolinkPos;
    var offset = 0;

    while (opIter.hasNext()) {
      var o = opIter.next();
      Changeset.eachAttribNumber(o.attribs, function(n) {
        if (n == autolinkAttrNum) {
          autolinkPos = [currCaretLine, offset];
        }
      });

      offset += o.chars;
    }

    return autolinkPos;
  }

  /**
   * If autolink is detected on a line while typing, this is called to get
   * things rolling.
   */
  function handleAutocomplete() {
    var cs = editor.getCurrentCallStack();
    console.log("type=" + cs.type);

    // Don't trigger autolink if the caretWord is in an autocompleted link
    var isLink = caretWordInLink();
    var autolinkStartPos = findAutolinkStartPosition();

    // Store the position state to clear the marker if the user clicks out.
    lastAutolinkPosition = autolinkStartPos;

    var word = isValidLinkStart(autolinkStartPos) ? linkWord(autolinkStartPos) :
        editor.caretWord();

    if (!isLink && autolinkStartPos && word &&
        shouldTriggerLink_(word.word, word.start)) {
      if (cs.docTextChanged) {
        var position = caretWordPopupPosition();
        autocompleteCallback_(word.word, null, word.start, word.end,
            position);
      }
    } else if (autolinkStartPos && cs.docTextChanged) {
      if (!shouldTriggerLink_(word.word, word.start)) {
        autocompleteCallback_(null);
      }
    } else {
      autocompleteCallback_(null);
    }
  }

  /**
   * @param {Array.<number, number>} The line/column of a word.
   * @return {boolean} Whether the word is a start of a link.
   */
  function isValidLinkStart(linkingStart) {
    var currLine = editor.caretLine();
    var currCol = editor.caretColumn();
    if (linkingStart) {
      if (linkingStart[0] == currLine && linkingStart[1] < currCol) {
        return true;
      }
    }

    return false;
  }

  /**
   * Kind of like caretWord but goes back to the last triggeredLink position.
   * @param {Array.<number, number>} The line/column of a word.
   * @return {Object} The linked word and its location.
   */
  function linkWord(linkingStart) {
    var docChar = editor.charFromLineAndColumn(linkingStart);
    var word = '';

    var rep = editor.getRep();
    while (docChar < editor.caretDocChar()) {
      word += rep.alltext.charAt(docChar);
      docChar++;
    }


    var end = editor.lineAndColumnFromChar(docChar);
    return { word: word, start: linkingStart, end: end };
  }

  /**
   * @return {Object=} The x/y coordinates of where to show an autocomplete
   *     popup, if any.
   */
  function caretWordPopupPosition() {
    var browserSelection = editor.getSelection();
    var focusPoint = (browserSelection.focusAtStart ?
        browserSelection.startPoint : browserSelection.endPoint);

    var n = focusPoint.node;
    // We can't assume the parent is the span, styling attributes create deeper
    // nesting contexts
    while (n && n.parentNode && n.tagName != "SPAN") {
      n = n.parentNode;
    }

    while (n && n.previousSibling && !hasClass(n, "autolink")) {
      n = n.previousSibling;
    }

    if (!n) {
      return null;
    }

    if (!hasClass(n, "autolink") && n.tagName != "AUTOLINK") {
      return null;
    }

    var x = n.offsetLeft;
    var y = n.offsetTop + editor.textLineHeight() + 3;

    return { x: x, y: y };
  }

  /**
   * @return {boolean} Whether the current caret is within a link section.
   */
  function caretWordInLink() {
    var browserSelection = editor.getSelection();
    if (!browserSelection) {
      return false;
    }

    var focusPoint = (browserSelection.focusAtStart ?
        browserSelection.startPoint : browserSelection.endPoint);
    var n = focusPoint.node.parentNode;

    return hasClass(n, "attrlink");
  }

  // Public methods.
  return {
    autocompleteCallback: autocompleteCallback,
    caretWordPopupPosition: caretWordPopupPosition,
    clearAutolink: clearAutolink,
    findAutolinkStartPosition: findAutolinkStartPosition,
    handleAutocomplete: handleAutocomplete,
    isValidLinkStart: isValidLinkStart,
    getLastAutolinkPosition: getLastAutolinkPosition,
    linkWord: linkWord,
    setAutocompleteCallback: setAutocompleteCallback,
    setAutolink: setAutolink,
    setLastAutolinkPosition: setLastAutolinkPosition,
    setTriggerLink: setTriggerLink,
    shouldTriggerLink: shouldTriggerLink
  };
};
