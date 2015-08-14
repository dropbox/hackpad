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

var ace = {};
ace.ui = {};

ace.editor = function(rootSelector, observer) {
  /***************************************************************************
   * Variables/constants
   ***************************************************************************/

  var REGEX_SPACE = /\s/;
  // set of "letter or digit" chars is based on section 20.5.16 of the original
  // Java Language Spec
  var REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
  var STYLE_ATTRIBS = { bold: true, italic: true, underline: true,
      strikethrough: true, superscript: true, subscript: true,
      list: true, code: true };

  var caughtErrors = [];
  var currentCallStack = null;
  var currentHeight;
  var disposed = false;
  var dynamicCSS = null;
  var inInternationalComposition = false;
  var isEditable = true;
  var isScrolling = false;
  var _nextId = 1;
  var observedChanges;
  var rep = {
    lines: newSkipList(),
    selStart: null,
    selEnd: null,
    // selFocusAtStart -- determines whether the selection extends "backwards",
    // so that the focus point (controlled with the arrow keys) is at the
    // beginning; not supported in IE, though native IE selections have that
    // behavior (which we try not to interfere with).
    // Must be false if selection is collapsed!
    selFocusAtStart: false,
    alltext: "",
    alines: [],
    apool: new AttribPool()
  };
  var root = $(rootSelector)[0];
  var self = this;
  var thisAuthor = '';
  var textFace = 'monospace';
  var textSize = 12;


  /***************************************************************************
   * Getters/setters
   ***************************************************************************/

  self.getCurrentCallStack = function() { return currentCallStack; }
  self.getDynamicCSS = function() { return dynamicCSS; }
  self.getIdleWorkTimer = function() { return idleWorkTimer; }
  self.getInInternationalComposition = function() {
    return inInternationalComposition;
  }
  self.getIsEditable = function() { return isEditable; }
  function getInnerHeight() { return $(root).height(); }
  function getInnerWidth() { return $(root).width(); }
  self.getObserver = function() { return observer; }
  self.getRep = function() { return rep; }
  self.getRoot = function() { return root; }
  self.getRootSelector = function() { return rootSelector; }
  self.getTextFace = function() { return textFace; }
  self.getThisAuthor = function() { return thisAuthor; }
  self.textLineHeight = function() { return 20; }

  self.setInInternationalComposition = function(setting) {
    inInternationalComposition = setting;
  }
  self.setIsScrolling = function(setting) { isScrolling = setting; }
  function setTextFace(face) {
    textFace = face;
    root.style.fontFamily = textFace;
  }
  function setTextSize(size) {
    textSize = size;
    root.style.fontSize = textSize+"px";
    root.style.lineHeight = self.textLineHeight()+"px";
  }
  function setIsMobileApp(value) {
    setClassPresence(root, 'mobile-app', value);
  }
  function setIsDesktopApp(value) {
    setClassPresence(root, 'desktop-app', value);
  }

  // lines, alltext, alines, and DOM are set up in setup()
  if (undoModule.enabled) {
    undoModule.apool = rep.apool;
  }

  /**
   * Sets various config values on the editor.
   * @param {string} key .
   * @param {string} value .
   */
  self.setProperty = function(key, value) {
    var k = key.toLowerCase();
    if (k == "showsauthorcolors") {
      // always on
      // setClassPresence(root, "authorColors", !!value);
    } else if (k == "showsuserselections") {
      setClassPresence(root, "userSelections", !!value);
    } else if (k == "showslinenumbers") {
      fixView();
    } else if (k == "grayedout") {
      setClassPresence(document.body, "grayedout", !!value);
    } else if (k == "dmesg") {
      dmesg = value;
      window.dmesg = value;
    } else if (k == 'userauthor') {
      thisAuthor = String(value);
    } else if (k == 'shortnames') {
      self.setShortNames(value);
    } else if (k == 'textface') {
      setTextFace(value);

      if (value == 'monospace') {
        $(root).attr('spellcheck', 'false');
      } else if (ace.util.isValidBrowserForSpellcheck()) {
        $(root).removeAttr('spellcheck');
      }
    } else if (k == 'textsize') {
      // setTextSize(value);
    } else if (k == 'tokenizer') {
      self.setTokenizer(value);
    } else if (k == 'langtokenizer') {
      self.setTokenizer(value[0], value[1]);
    } else if (k == 'ismobileapp') {
      setIsMobileApp(value);
    } else if (k == 'isdesktopapp') {
      setIsDesktopApp(value);
    }else if (k == 'notitle') {
      setClassPresence(root, "notitle", value);
    } else if (k == 'min-height') {
      root.style.minHeight = value + "px";
    }
  }

  /***************************************************************************
   * Setup
   ***************************************************************************/

  /**
   * Sets up and initializes the Ace editor.
   */
  function setup() {
    decorate(self, new ace.selection(self));
    decorate(self, new ace.lists(self));
    decorate(self, new ace.autolink(self));
    decorate(self, new ace.code(self));
    decorate(self, new ace.tables(self));
    decorate(self, new ace.authors(self));
    //decorate(self, new ace.legacy(self));
    decorate(self, makeChangesetTracker(window, rep.apool, {
      withCallbacks: function(operationName, f) {
        self.inCallStackIfNecessary(operationName, function() {
          self.fastIncorp();
          f({
            setDocumentAttributedText: function(atext) {
              self.setDocAText(atext);
            },
            applyChangesetToDocument: function(changeset,
                preferInsertionAfterCaret) {
              var oldEventType = currentCallStack.editEvent.eventType;
              currentCallStack.startNewEvent("nonundoable");
              self.performDocumentApplyChangeset(changeset,
                  preferInsertionAfterCaret);
              currentCallStack.startNewEvent(oldEventType);
            }
          });
        });
      }
    }));

    observer.attachEditor(self);

    self.inCallStack("setup", function() {
      if (browser.mozilla) {
        addClass(root, "mozilla");
      } else if (browser.safari) {
        addClass(root, "safari");
      } else if (browser.msie) {
        addClass(root, "msie");
        // cache CSS background images
        try {
          document.execCommand("BackgroundImageCache", false, true);
        } catch (e) {
          /* throws an error in some IE 6 but not others! */
        }
      }

      setClassPresence(root, "doesWrap", true);
      dynamicCSS = makeCSSManager("dynamicsyntax");
      setClassPresence(root, "authorColors", false);
      enforceEditability();

      // set up dom and rep
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }

      var oneEntry = createDomLineEntry("");
      doRepLineSplice(0, rep.lines.length(), [oneEntry]);
      insertDomLines(null, [oneEntry.domInfo], null);
      rep.alines = Changeset.splitAttributionLines(
          Changeset.makeAttribution("\n"), "\n");

      bindTheEventHandlers();
    });

    // Turn off spellcheck for non-whitelisted browsers.
    if (!ace.util.isValidBrowserForSpellcheck()) {
      $(root).attr('spellcheck', 'false');
    }

    self.setupSelectionToolbar();

    setTimeout(function() { $(root).addClass('loaded'); }, 0);
  }

  /**
   * Imports an initial set of attributed text.
   * @param {Object} atext .
   * @param {Object} apoolJsonObj The attribute pool.
   * @param {boolean} undoable Whether this operation is undoable.
   */
  self.importAText = function(atext, apoolJsonObj, undoable) {
    atext = Changeset.cloneAText(atext);

    if (apoolJsonObj) {
      var wireApool = (new AttribPool()).fromJsonable(apoolJsonObj);
      atext.attribs = Changeset.moveOpsToNewPool(atext.attribs, wireApool,
          rep.apool);
    }

    self.inCallStackIfNecessary("importText" + (undoable ? "Undoable" : ""),
        function() {
          self.setDocAText(atext);
        });
  }

  /**
   * Sets the document to the given atext.
   * @param {Object} atext .
   */
  self.setDocAText = function(atext) {
    self.fastIncorp();

    var oldLen = rep.lines.totalWidth();
    var numLines = rep.lines.length();
    var upToLastLine = rep.lines.offsetOfIndex(numLines - 1);
    var lastLineLength = rep.lines.atIndex(numLines - 1).text.length;
    var assem = Changeset.smartOpAssembler();
    var o = Changeset.newOp('-');
    o.chars = upToLastLine;
    o.lines = numLines - 1;
    assem.append(o);
    o.chars = lastLineLength;
    o.lines = 0;
    assem.append(o);
    Changeset.appendATextToAssembler(atext, assem);
    var newLen = oldLen + assem.getLengthChange();
    var changeset = Changeset.checkRep(
        Changeset.pack(oldLen, newLen, assem.toString(),
            atext.text.slice(0, -1)));
    self.performDocumentApplyChangeset(changeset);

    idleWorkTimer.atMost(100);

    if (rep.alltext != atext.text) {
      dmesg(htmlPrettyEscape(rep.alltext));
      dmesg(htmlPrettyEscape(atext.text));
      throw new Error("mismatch error setting raw text in setDocAText");
    }
  }

  /**
   * Disposes the Ace editor.
   */
  self.dispose = function() {
    disposed = true;
    if (idleWorkTimer) idleWorkTimer.never();
    teardown();
  }

  /**
   * Removes all event handlers and listeners.
   */
  function teardown() {
    observer && observer.detachEditor();
    observer = null;
  }

  /**
   * Attaches listeners for all the events.
   */
  function bindTheEventHandlers() {
    $(root).on('mousedown mouseout mouseover mouseup touchstart ' +
        'touchmove paste focus blur', function(e) {
      observer.trigger(e.type, [e]);
    });
    $(root).on('dragstart', function(e) {
      e.preventDefault(); // disable dragging of images.
    });
    $(root).on('keydown keypress keyup', function(e) {
      observer.trigger('key-event', [e]);
    });
    $(root).on('touchend click', function(e) {
      observer.trigger('click', [e]);
    });
    $(document).on('dragover drop', function(e) {
      observer.trigger(e.type, [e]);
    });
    $(window).on('scroll', throttle(function(e) {
      observer.trigger('scroll-throttled', [e]);
    }, 100));
    $(window).on('scroll', function(e) {
      observer.trigger('scroll', [e]);
    });
    $(window).on('resize', throttle(function(e) {
      observer.trigger('resize', [e]);
    }, 100));

    if (browser.msie) {
      $(root).on('click', function(e) {
        observer.trigger('ie-click', [e]);
      });
    } else if (document.documentElement) {
      $(document.documentElement).on('compositionstart compositionend',
          function(e) {
            observer.trigger(e.type, [e]);
          });
      $(document.documentElement).on('click', function(e) {
        observer.trigger('capture-click', [e]);
      });
    }

    $(window).on('unload', teardown);
  }

  // "dmesg" is for displaying messages in the in-page output pane
  // visible when "?djs=1" is appended to the pad URL.  It generally
  // remains a no-op unless djs is enabled, but we make a habit of
  // only calling it in error cases or while debugging.
  var dmesg = window.dmesg = noop;
  var PROFILER = window.PROFILER;
  if (!PROFILER) {
    PROFILER = function() {
      return { start: noop, mark: noop, literal: noop, end: noop,
          cancel: noop };
    };
  }


  /***************************************************************************
   * Call stack processing.
   ***************************************************************************/

  /**
   * Wraps a function in a 'call stack' giving the function context when being
   * executed.  If the original function kicks off more complex operations then
   * they become bundled together with the original function's general
   * execution.
   * @param {string} type The call stack to create.
   * @param {Function} action The callback to execute.
   */
  self.inCallStack = function(type, action) {
    if (disposed) return;

    if (currentCallStack) {
      console.error("Can't enter callstack " + type + ", already in " +
          currentCallStack.type);
    }

    var profiling = false;
    function profileRest() {
      profiling = true;
      console.profile();
    }

    function newEditEvent(eventType) {
      return { eventType: eventType, backset: null };
    }

    function submitOldEvent(evt) {
      if (rep.selStart && rep.selEnd) {
        var selStartChar =
            rep.lines.offsetOfIndex(rep.selStart[0]) + rep.selStart[1];
        var selEndChar =
            rep.lines.offsetOfIndex(rep.selEnd[0]) + rep.selEnd[1];
        evt.selStart = selStartChar;
        evt.selEnd = selEndChar;
        evt.selFocusAtStart = rep.selFocusAtStart;
      }

      if (undoModule.enabled) {
        var undoWorked = false;

        try {
          if (evt.eventType == "setup" || evt.eventType == "importText" ||
              evt.eventType == "setBaseText") {
            undoModule.clearHistory();
          } else if (evt.eventType == "nonundoable") {
            if (evt.changeset) {
              undoModule.reportExternalChange(evt.changeset);
            }
          } else {
            undoModule.reportEvent(evt);
          }
          undoWorked = true;
        } catch(ex) { // ie7/8
        } finally {
          if (!undoWorked) {
            undoModule.enabled = false; // for safety
          }
        }
      }
    }

    function startNewEvent(eventType, dontSubmitOld) {
      var oldEvent = currentCallStack.editEvent;
      if (!dontSubmitOld) {
        submitOldEvent(oldEvent);
      }

      currentCallStack.editEvent = newEditEvent(eventType);
      return oldEvent;
    }

    currentCallStack = {
      type: type, docTextChanged: false, selectionAffected: false,
      userChangedSelection: false,
      domClean: false, profileRest: profileRest,
      isUserChange: false, // is this a "user change" type of call-stack
      repChanged: false, editEvent: newEditEvent(type),
      startNewEvent: startNewEvent
    };

    var cleanExit = false;
    var result;

    try {
      result = action();
      //console.log("Just did action for: "+type);
      cleanExit = true;
    } catch (e) {
      caughtErrors.push({ error: e, time: +new Date( ) });
      dmesg(e.toString());
      throw e;
    } finally {
      var cs = currentCallStack;
      //console.log("Finished action for: "+type);
      if (cleanExit) {
        submitOldEvent(cs.editEvent);

        if (cs.domClean && cs.type != "setup") {
          if (cs.selectionAffected) {
            self.updateBrowserSelectionFromRep();
          }

          // excluding "handleKeyEvent" to avoid scrolling on page up/ page down
          if ((cs.docTextChanged || cs.userChangedSelection
              /*|| cs.type == "handleKeyEvent"*/) &&
              cs.type != "applyChangesToBase") {
            self.scrollSelectionIntoView();
            observer.trigger('caret');
          }

          if (cs.isUserChange && cs.selectionAffected && cs.repChanged &&
              !cs.isTriggeringAutocomplete) {
            self.handleAutocomplete();
          }

          if (cs.docTextChanged && cs.type.indexOf("importText") < 0) {
            observer.trigger('caret');
          }
        }
      } else {
        // non-clean exit
        if (currentCallStack.type == "idleWorkTimer") {
          idleWorkTimer.atLeast(1000);
        }
      }

      currentCallStack = null;
      if (profiling) console.profileEnd();
    }

    return result;
  }

  /**
   * Wraps the function in a call stack, if there's no call stack currently.
   * Otherwise, it's part of the original call stacks operation.
   * @param {string} type The call stack to create.
   * @param {Function} action The callback to execute.
   */
  self.inCallStackIfNecessary = function(type, action) {
    if (!currentCallStack) {
      self.inCallStack(type, action);
    } else {
      action();
    }
  }

  /**
   * @return {Array.<Object>} A list of the errors caught while executing in a
   *     call stack.
   */
  self.getUnhandledErrors = function() {
    return caughtErrors.slice();
  }

  /**
   * Wraps a function in a wrapper that allows it access to the editor's
   * public methods.
   * @param {Function} fn .
   * @param {string} callStack The type of call stack to create.
   * @param {boolean} normalize Whether to normalize the text (call fastIncorp)
   *     before execution.
   */
  self.callWithAce = function(fn, callStack, normalize) {
    var wrapper = function () {
      return fn(self);
    }

    if (normalize !== undefined) {
      var wrapper1 = wrapper;
      wrapper = function () {
        self.fastIncorp();
        wrapper1();
      }
    }

    if (callStack !== undefined) {
      return self.inCallStack(callStack, wrapper);
    } else {
      return wrapper();
    }
  }

  /**
   * Creates a call stack called every so often to perform work that is
   * secondary and needs to be deferred to prevent UI slowdown.
   */
  var idleWorkTimer = ace.util.makeIdleAction(function() {
    if (!isEditable) return; // and don't reschedule

    if (inInternationalComposition) {
      // don't do idle input incorporation during international input
      // composition
      idleWorkTimer.atLeast(500);
      return;
    }

    self.inCallStack("idleWorkTimer", function() {
      var isTimeUp = ace.util.newTimeLimit(99);
      var finishedImportantWork = false;
      var finishedWork = false;

      try {
        // isTimeUp() is a soft constraint for incorporateUserChanges,
        // which always renormalizes the DOM, no matter how long it takes,
        // but doesn't necessarily lex and highlight it
        incorporateUserChanges(isTimeUp);
        finishedImportantWork = true;
        if (isTimeUp() || isScrolling) return;
        observer.trigger('idlework', [isTimeUp]);
        if (isTimeUp()) return;
        finishedWork = true;
      } catch(ex) { // ie7/8
      } finally {
        if (finishedWork) {
          idleWorkTimer.atMost(1000);
        } else if (finishedImportantWork) {
          // if we've finished highlighting the view area,
          // more highlighting could be counter-productive,
          // e.g. if the user just opened a triple-quote and will soon close it.
          idleWorkTimer.atMost(500);
        } else {
          var timeToWait = Math.round(isTimeUp.elapsed() / 2);
          if (timeToWait < 100) timeToWait = 100;
          idleWorkTimer.atMost(timeToWait);
        }
      }
    });
  });


  /***************************************************************************
   * Range manipulation.
   ***************************************************************************/

  /**
   * @param {Array.<number>} startPos The line/column of the range start.
   * @param {Array.<number>} startPos The line/column of the range end.
   * @return {string The text within a range.
   */
  self.getTextInRange = function(startPos, endPos) {
    var startOffset = rep.lines.offsetOfIndex(startPos[0]) + startPos[1];
    var endOffset = rep.lines.offsetOfIndex(endPos[0]) + endPos[1];
    return rep.alltext.substring(startOffset, endOffset);
  }

  /**
   * Creates a changeset based off a range of text.
   * @param {Array.<number>} startPos The line/column of the range start.
   * @param {Array.<number>} startPos The line/column of the range end.
   * @return {Object} The apool and atext of the changeset.
   */
  self.createChangesetFromRange = function(start, end) {
    // collect all the content selected
    var selStartLine = start[0];
    var selEndLine = end[0];

    var builder = Changeset.builder(rep.lines.totalWidth());
    self.buildRemoveRange(builder, [0, 0], start);
    self.buildKeepRange(builder, start, end, [], rep.apool);
    var lastLine = rep.lines.length() - 1;
    var lastCol = rep.lines.atIndex(lastLine).text.length;
    self.buildRemoveRange(builder, end,
        [lastLine, lastCol + 1 /*account for trailing newline*/]);
    var cs = builder.toString();

    var curAtext = { text: rep.alltext,
      attribs: Changeset.joinAttributionLines(rep.alines)
    };
    var atext = Changeset.applyToAText(cs, curAtext, rep.apool);

    var apool = new AttribPool();
    atext.attribs = Changeset.moveOpsToNewPool(atext.attribs, rep.apool, apool);

    return { apool: apool, atext: atext };
  }

  /**
   * Replace a range of text with new text.
   * @param {Array.<number>} start The line/column of the range start.
   * @param {Array.<number>} end The line/column of the range end.
   * @param {string} text The new text.
   * @param {Array} attribs The new attributes for this text.
   * @param {boolean} insertsAfterSelection The new text goes after the range.
   */
  self.replaceRange = function(start, end, text, attribs,
      insertsAfterSelection) {
    self.inCallStackIfNecessary('replaceRange', function() {
      self.fastIncorp();
      self.performDocumentReplaceRange(start, end, text, attribs,
          insertsAfterSelection);
    });
  }

  /**
   * Replace a range of text with new text.
   * @param {Array.<number>} start The line/column of the range start.
   * @param {Array.<number>} end The line/column of the range end.
   * @param {string} text The new text.
   * @param {Array} attribs The new attributes for this text.
   * @param {boolean} insertsAfterSelection The new text goes after the range.
   */
  self.performDocumentReplaceRange = function(start, end, newText, attribs,
      insertsAfterSelection) {
    if (start == undefined) start = rep.selStart;
    if (end == undefined) end = rep.selEnd;

    //dmesg(String([start.toSource(),end.toSource(),newText.toSource()]));

    // start[0]: <--- start[1] --->CCCCCCCCCCC\n
    //           CCCCCCCCCCCCCCCCCCCC\n
    //           CCCC\n
    // end[0]:   <CCC end[1] CCC>-------\n

    var builder = Changeset.builder(rep.lines.totalWidth());
    buildKeepToStartOfRange(builder, start);
    self.buildRemoveRange(builder, start, end);
    builder.insert(newText, [['author', thisAuthor]].concat(attribs || []),
        rep.apool);
    var cs = builder.toString();

    self.performDocumentApplyChangeset(cs, insertsAfterSelection);
  }

  /**
   * Replaces a range, based on char position, with new text.
   * @param {number} startChar The starting position.
   * @param {number} endChar The ending position.
   * @param {string} newText .
   */
  self.performDocumentReplaceCharRange = function(startChar, endChar, newText) {
    if (startChar == endChar && newText.length == 0) {
      return;
    }

    // Requires that the replacement preserve the property that the
    // internal document text ends in a newline.  Given this, we
    // rewrite the splice so that it doesn't touch the very last
    // char of the document.
    if (endChar == rep.alltext.length) {
      if (startChar == endChar) {
        // an insert at end
        startChar--;
        endChar--;
        newText = '\n' + newText.substring(0, newText.length - 1);
      } else if (newText.length == 0) {
        // a delete at end
        startChar--;
        endChar--;
      } else {
        // a replace at end
        endChar--;
        newText = newText.substring(0, newText.length - 1);
      }
    }

    self.performDocumentReplaceRange(self.lineAndColumnFromChar(startChar),
        self.lineAndColumnFromChar(endChar), newText);
  }

  /**
   * Applies attributes to a range.
   * @param {Array.<number>} start The line/column of the range start.
   * @param {Array.<number>} end The line/column of the range end.
   * @param {Array} attribs .
   */
  self.performDocumentApplyAttributesToRange = function(start, end, attribs) {
    var builder = Changeset.builder(rep.lines.totalWidth());
    buildKeepToStartOfRange(builder, start);
    self.buildKeepRange(builder, start, end, attribs, rep.apool);
    var cs = builder.toString();
    self.performDocumentApplyChangeset(cs);
  }

  /**
   * Applies attributes to a range, based on char position.
   * @param {number} startChar The starting position.
   * @param {number} endChar The ending position.
   * @param {Array} attribs .
   */
  function performDocumentApplyAttributesToCharRange(start, end, attribs) {
    if (end >= rep.alltext.length) {
      end = rep.alltext.length - 1;
    }

    self.performDocumentApplyAttributesToRange(
        self.lineAndColumnFromChar(start),
        self.lineAndColumnFromChar(end), attribs);
  }

  /**
   * Adds preceding text of the range to the builder.
   * @param {Object} builder The builder to add to.
   * @param {Array.<number>} start The line/column of the range start.
   */
  function buildKeepToStartOfRange(builder, start) {
    var startLineOffset = rep.lines.offsetOfIndex(start[0]);

    builder.keep(startLineOffset, start[0]);
    builder.keep(start[1]);
  }

  /**
   * Removes a range from the changeset builder.
   * @param {Object} builder The builder to remove from.
   * @param {Array.<number>} start The line/column of the range start.
   * @param {Array.<number>} end The line/column of the range end.
   */
  self.buildRemoveRange = function(builder, start, end) {
    var startLineOffset = rep.lines.offsetOfIndex(start[0]);
    var endLineOffset = rep.lines.offsetOfIndex(end[0]);

    if (end[0] > start[0]) {
      builder.remove(endLineOffset - startLineOffset - start[1],
          end[0] - start[0]);
      builder.remove(end[1]);
    } else {
      // Make sure the end position column offset doesn't exceed the current
      // number of columns.  This would cause line count misalignment and can
      // happen with autocompletion.
      var endCol = Math.min(end[1], rep.lines.atIndex(end[0]).width - 1);
      builder.remove(endCol - start[1]);
    }
  }

  /**
   * Adds a range to the changeset builder.
   * @param {Object} builder The builder to add to.
   * @param {Array.<number>} start The line/column of the range start.
   * @param {Array.<number>} end The line/column of the range end.
   * @param {Array} attribs .
   * @param {Object} pool The attribute pool.
   */
  self.buildKeepRange = function(builder, start, end, attribs, pool) {
    var startLineOffset = rep.lines.offsetOfIndex(start[0]);
    var endLineOffset = rep.lines.offsetOfIndex(end[0]);

    if (end[0] > start[0]) {
      builder.keep(endLineOffset - startLineOffset - start[1],
          end[0] - start[0], attribs, pool);
      builder.keep(end[1], 0, attribs, pool);
    } else {
      // Make sure the end position column offset doesn't exceed the current
      // number of columns (not including the newline char).
      var endCol = Math.min(end[1], rep.lines.atIndex(end[0]).width - 1);
      builder.keep(endCol - start[1], 0, attribs, pool);
    }
  }

  /**
   * Replace selection with new text.
   * @param {string} newText .
   * @param {boolean} preserveListType Whether to keep the list or not.
   */
  self.performDocumentReplaceSelection = function(newText, preserveListType) {
    if (!(rep.selStart && rep.selEnd)) return;
    var start = rep.selStart;
    var end = rep.selEnd;
    if (!preserveListType) {
      if (start[1] == rep.lines.atIndex(start[0]).lineMarker) {
        // replace next to *, include it
        start = [start[0], 0];
      }
      if (end[1] == rep.lines.atIndex(end[0]).lineMarker) {
        // replace including *, exclude it
        end = [end[0], 0];
      }
    }

    self.performDocumentReplaceRange(start, end, newText);
  }


  /***************************************************************************
   * Observing changes around nodes.
   ***************************************************************************/

  /**
   * Resets observed changes.
   */
  function clearObservedChanges() {
    observedChanges = { cleanNodesNearChanges: {} };
  }
  clearObservedChanges();

  /**
   * Looks for changes around a node and adds it to observedChanges.
   * Around this top-level DOM node, look for changes to the document
   * (from how it looks in our representation) and record them in a way
   * that can be used to "normalize" the document (apply the changes to our
   * representation, and put the DOM in a canonical form).
   * @param {Element} node .
   */
  function observeChangesAroundNode(node) {
    var cleanNode;
    var hasAdjacentDirtyness;
    if (!self.isNodeDirty(node)) {
      cleanNode = node;
      var prevSib = cleanNode.previousSibling;
      var nextSib = cleanNode.nextSibling;
      hasAdjacentDirtyness = ((prevSib && self.isNodeDirty(prevSib)) ||
          (nextSib && self.isNodeDirty(nextSib)));
    } else {
      // node is dirty, look for clean node above
      var upNode = node.previousSibling;
      while (upNode && self.isNodeDirty(upNode)) {
        upNode = upNode.previousSibling;
      }

      if (upNode) {
        cleanNode = upNode;
      } else {
        var downNode = node.nextSibling;
        while (downNode && self.isNodeDirty(downNode)) {
          downNode = downNode.nextSibling;
        }
        if (downNode) {
          cleanNode = downNode;
        }
      }

      if (!cleanNode) {
        // Couldn't find any adjacent clean nodes!
        // Since top and bottom of doc is dirty, the dirty area will be
        // detected.
        return;
      }

      hasAdjacentDirtyness = true;
    }

    if (hasAdjacentDirtyness) {
      // previous or next line is dirty
      observedChanges.cleanNodesNearChanges['$' + uniqueId(cleanNode)] = true;
    } else {
      // next and prev lines are clean (if they exist)
      var lineKey = uniqueId(cleanNode);
      var prevSib = cleanNode.previousSibling;
      var nextSib = cleanNode.nextSibling;
      var actualPrevKey = ((prevSib && uniqueId(prevSib)) || null);
      var actualNextKey = ((nextSib && uniqueId(nextSib)) || null);
      var repPrevEntry = rep.lines.prev(rep.lines.atKey(lineKey));
      var repNextEntry = rep.lines.next(rep.lines.atKey(lineKey));
      var repPrevKey = ((repPrevEntry && repPrevEntry.key) || null);
      var repNextKey = ((repNextEntry && repNextEntry.key) || null);
      if (actualPrevKey != repPrevKey || actualNextKey != repNextKey) {
        observedChanges.cleanNodesNearChanges['$' + uniqueId(cleanNode)] = true;
      }
    }
  }

  /**
   * Looks for changes in the current observed selection.
   */
  self.observeChangesAroundSelection = function() {
    if (currentCallStack.observedSelection) return;
    currentCallStack.observedSelection = true;

    var p = PROFILER("getSelection", false);
    var selection = self.getSelection();
    p.end();

    if (selection) {
      function topLevel(n) {
        if ((!n) || n == root) return null;
        while (n.parentNode != root) {
          n = n.parentNode;
        }
        return n;
      }

      var node1 = topLevel(selection.startPoint.node);
      var node2 = topLevel(selection.endPoint.node);
      if (node1) {
        observeChangesAroundNode(node1);
      }
      if (node2 && node1 != node2) {
        observeChangesAroundNode(node2);
      }
    }
  }

  /**
   * Works around a FF bug with <style> nodes.
   */
  function observeSuspiciousNodes() {
    // inspired by Firefox bug #473255, where pasting formatted text
    // causes the cursor to jump away, making the new HTML never found.
    if (root.getElementsByTagName) {
      var nds = root.getElementsByTagName("style");
      for (var i = 0; i < nds.length; i++) {
        var n = nds[i];
        while (n.parentNode && n.parentNode != root) {
          n = n.parentNode;
        }
        if (n.parentNode == root) {
          observeChangesAroundNode(n);
        }
      }
    }
  }

  /**
   * Based on observedChanges, return a list of ranges of original lines
   * that need to be removed or replaced with new user content to incorporate
   * the user's changes into the line representation.  Ranges may be
   * zero-length, indicating inserted content.  For example, [0,0] means
   * content was inserted at the top of the document, while [3,4] means line 3
   * was deleted, modified, or replaced with one or more new lines of content.
   * Ranges do not touch.
   * @return {Array} A list of dirty ranges.
   */
  function getDirtyRanges() {
    var p = PROFILER("getDirtyRanges", false);
    p.forIndices = 0;
    p.consecutives = 0;
    p.corrections = 0;

    var cleanNodeForIndexCache = {};
    var N = rep.lines.length(); // old number of lines
    function cleanNodeForIndex(i) {
      // if line (i) in the un-updated line representation maps to a clean node
      // in the document, return that node.
      // if (i) is out of bounds, return true. else return false.
      if (cleanNodeForIndexCache[i] === undefined) {
        p.forIndices++;

        var result;
        if (i < 0 || i >= N) {
          result = true; // truthy, but no actual node
        } else {
          var key = rep.lines.atIndex(i).key;
          result = (getCleanNodeByKey(key) || false);
        }

        cleanNodeForIndexCache[i] = result;
      }
      return cleanNodeForIndexCache[i];
    }

    var isConsecutiveCache = {};
    function isConsecutive(i) {
      if (isConsecutiveCache[i] === undefined) {
        p.consecutives++;
        isConsecutiveCache[i] = (function() {
          // returns whether line (i) and line (i-1), assumed to be map to
          // clean DOM nodes, or document boundaries, are consecutive in the
          // changed DOM
          var a = cleanNodeForIndex(i - 1);
          var b = cleanNodeForIndex(i);
          if ((!a) || (!b)) return false; // violates precondition
          if ((a === true) && (b === true)) return !root.firstChild;
          if ((a === true) && b.previousSibling) return false;
          if ((b === true) && a.nextSibling) return false;
          if ((a === true) || (b === true)) return true;
          return a.nextSibling == b;
        })();
      }

      return isConsecutiveCache[i];
    }

    function isClean(i) {
      // returns whether line (i) in the un-updated representation maps to a
      // clean node, or is outside the bounds of the document
      return !!cleanNodeForIndex(i);
    }

    // list of pairs, each representing a range of lines that is clean and
    // consecutive in the changed DOM.  lines (-1) and (N) are always clean,
    // but may or may not be consecutive with lines in the document.
    // Pairs are in sorted order.
    var cleanRanges = [[-1, N + 1]];
    function rangeForLine(i) {
      // returns index of cleanRange containing i, or -1 if none
      var answer = -1;
      forEach(cleanRanges, function (r, idx) {
        if (i >= r[1]) return false; // keep looking
        if (i < r[0]) return true; // not found, stop looking
        answer = idx;
        return true; // found, stop looking
      });

      return answer;
    }

    function removeLineFromRange(rng, line) {
      // rng is index into cleanRanges, line is line number
      // precond: line is in rng
      var a = cleanRanges[rng][0];
      var b = cleanRanges[rng][1];
      if ((a+1) == b) cleanRanges.splice(rng, 1);
      else if (line == a) cleanRanges[rng][0]++;
      else if (line == (b-1)) cleanRanges[rng][1]--;
      else cleanRanges.splice(rng, 1, [a,line], [line + 1,b]);
    }

    function splitRange(rng, pt) {
      // precond: pt splits cleanRanges[rng] into two non-empty ranges
      var a = cleanRanges[rng][0];
      var b = cleanRanges[rng][1];
      cleanRanges.splice(rng, 1, [a, pt], [pt, b]);
    }

    var correctedLines = {};
    function correctlyAssignLine(line) {
      if (correctedLines[line]) return true;
      p.corrections++;
      correctedLines[line] = true;
      // "line" is an index of a line in the un-updated rep.
      // returns whether line was already correctly assigned (i.e. correctly
      // clean or dirty, according to cleanRanges, and if clean, correctly
      // attached or not attached (i.e. in the same range as) the prev and
      // next lines).
      var rng = rangeForLine(line);
      var lineClean = isClean(line);
      if (rng < 0) {
        if (lineClean) {
          console.log("somehow lost clean line");
        }

        return true;
      }

      if (! lineClean) {
        // a clean-range includes this dirty line, fix it
        removeLineFromRange(rng, line);
        return false;
      } else {
        // line is clean, but could be wrongly connected to a clean line
        // above or below
        var a = cleanRanges[rng][0];
        var b = cleanRanges[rng][1];
        var didSomething = false;
        // we'll leave non-clean adjacent nodes in the clean range for the
        // caller to detect and deal with.  we deal with whether the range
        // should be split just above or just below this line.
        if (a < line && isClean(line - 1) && ! isConsecutive(line)) {
          splitRange(rng, line);
          didSomething = true;
        }

        if (b > (line + 1) && isClean(line + 1) && ! isConsecutive(line + 1)) {
          splitRange(rng, line + 1);
          didSomething = true;
        }

        return !didSomething;
      }
    }

    function detectChangesAroundLine(line, reqInARow) {
      // make sure cleanRanges is correct about line number "line" and the
      // surrounding lines; only stops checking at end of document or after no
      // changes need making for several consecutive lines. note that iteration
      // is over old lines, so this operation takes time proportional to the
      // number of old lines that are changed or missing, not the number of new
      // lines inserted.
      var correctInARow = 0;
      var currentIndex = line;

      // search back from line
      while (correctInARow < reqInARow && currentIndex >= 0) {
        if (correctlyAssignLine(currentIndex)) {
          correctInARow++;
        } else {
          correctInARow = 0;
        }
        currentIndex--;
      }

      correctInARow = 0;
      currentIndex = line;
      while (correctInARow < reqInARow && currentIndex < N) {
        if (correctlyAssignLine(currentIndex)) {
          correctInARow++;
        } else {
          correctInARow = 0;
        }
        currentIndex++;
      }
    }

    if (N == 0) {
      p.cancel();
      if (!isConsecutive(0)) {
        splitRange(0, 0);
      }
    } else {
      p.mark("topbot");
      detectChangesAroundLine(0,1);
      detectChangesAroundLine(N - 1,1);

      p.mark("obs");
      //console.log("observedChanges: "+toSource(observedChanges));
      for (var k in observedChanges.cleanNodesNearChanges) {
        var key = k.substring(1);
        if (rep.lines.containsKey(key)) {
          var line = rep.lines.indexOfKey(key);
          detectChangesAroundLine(line, 2);
        }
      }

      p.mark("stats&calc");
      p.literal(p.forIndices, "byidx");
      p.literal(p.consecutives, "cons");
      p.literal(p.corrections, "corr");
    }

    var dirtyRanges = [];
    for(var r = 0; r < cleanRanges.length - 1; r++) {
      dirtyRanges.push([cleanRanges[r][1], cleanRanges[r + 1][0]]);
    }

    p.end();

    return dirtyRanges;
  }

  /**
   * Marks a dirty node as clean.
   * @param {Element} n Node to mark as clean.
   */
  self.markNodeClean = function(n) {
    // clean nodes have knownHTML that matches their innerHTML
    var dirtiness = {};
    dirtiness.nodeId = uniqueId(n);
    dirtiness.knownHTML = n.innerHTML;
    if (browser.msie) {
      // adding a space to an "empty" div in IE designMode doesn't
      // change the innerHTML of the div's parent; also, other
      // browsers don't support innerText
      dirtiness.knownText = n.innerText;
    }
    setAssoc(n, "dirtiness", dirtiness);
  }

  /**
   * @return {boolean} Whether a node is dirty.
   */
  self.isNodeDirty = function(n) {
    var p = PROFILER("cleanCheck", false);
    if (n.parentNode != root) return true;
    var data = getAssoc(n, "dirtiness");
    if (!data) return true;
    if (n.id !== data.nodeId) return true;
    if (browser.msie) {
      if (n.innerText !== data.knownText) return true;
    }
    if (n.innerHTML !== data.knownHTML) return true;
    p.end();
    return false;
  }


  /***************************************************************************
   * Incorporate changes.
   ***************************************************************************/

  /**
   * Where the magic happens :)
   * Brings the latest changes and tries to normalize/sanitize everything.
   *
   * "Building a robust, extensible editor on top of design mode is kind of
   * like landing a man safely on the moon, where you design the
   * spacecraft, the mission control computer, and the pressurized suit.
   * You're constantly trying to insulate yourself from a hostile
   * environment."
   *
   * @param {Function} isTimeUp The time alloted to finish the operation.
   * @return {boolean} Whether we made changes to the DOM.
   */
  function incorporateUserChanges(isTimeUp) {
    if (currentCallStack.domClean) {
      return false;
    }

    inInternationalComposition = false;
    currentCallStack.isUserChange = true;
    isTimeUp = (isTimeUp || function() { return false; });
    var p = PROFILER("incorp", false);
    if (!root.firstChild) {
      root.innerHTML = "<div><!-- --></div>";
    }

    // Observe.
    p.mark("obs");
    self.observeChangesAroundSelection();
    observeSuspiciousNodes();

    // Look for dirty ranges, based off of the observed changes.
    p.mark("dirty");
    var dirtyRanges = getDirtyRanges();
    var dirtyRangesCheckOut = true;
    var j = 0;
    var a, b;
    while (j < dirtyRanges.length) {
      a = dirtyRanges[j][0];
      b = dirtyRanges[j][1];
      if (!((a == 0 || getCleanNodeByKey(rep.lines.atIndex(a - 1).key)) &&
          (b == rep.lines.length() ||
          getCleanNodeByKey(rep.lines.atIndex(b).key)))) {
        dirtyRangesCheckOut = false;
        break;
      }
      j++;
    }
    if (!dirtyRangesCheckOut) {
      var numBodyNodes = root.childNodes.length;
      for(var k = 0; k < numBodyNodes; k++) {
        var bodyNode = root.childNodes.item(k);
        if ((bodyNode.tagName) && ((!bodyNode.id) ||
            (!rep.lines.containsKey(bodyNode.id)))) {
          observeChangesAroundNode(bodyNode);
        }
      }
      dirtyRanges = getDirtyRanges();
    }
    clearObservedChanges();

    // Get the selection.
    p.mark("getsel");
    var selection = self.getSelection();
    var selStart, selEnd;
    var i = 0;
    var splicesToDo = [];
    var netNumLinesChangeSoFar = 0;
    var toDeleteAtEnd = [];
    p.mark("ranges");
    p.literal(dirtyRanges.length, "numdirt");
    // each entry is [nodeToInsertAfter, [info1, info2, ...]]
    var domInsertsNeeded = [];

    // Go through dirty ranges.
    while (i < dirtyRanges.length) {
      var range = dirtyRanges[i];
      a = range[0];
      b = range[1];
      var firstDirtyNode = (((a == 0) && root.firstChild) ||
          getCleanNodeByKey(rep.lines.atIndex(a - 1).key).nextSibling);
      firstDirtyNode = (firstDirtyNode && self.isNodeDirty(firstDirtyNode) &&
          firstDirtyNode);
      var lastDirtyNode = (((b == rep.lines.length()) && root.lastChild) ||
          getCleanNodeByKey(rep.lines.atIndex(b).key).previousSibling);
      lastDirtyNode = (lastDirtyNode && self.isNodeDirty(lastDirtyNode) &&
          lastDirtyNode);

      if (firstDirtyNode && lastDirtyNode) {
        var cc = makeContentCollector(true /* isStyled */,
            browser, rep.apool, null, linestylefilter.className2Author);
        cc.notifySelection(selection);

        var dirtyNodes = [];
        for (var n = firstDirtyNode; n && !(n.previousSibling &&
            n.previousSibling == lastDirtyNode);
            n = n.nextSibling) {
          if (browser.msie) {
            // try to undo IE's pesky and overzealous linkification
            try {
              var ieAnchorFixRange = document.body.createTextRange();
              ieAnchorFixRange.moveToElementText(n);
              ieAnchorFixRange.execCommand("unlink", false, null);
            } catch (e) {}
          }

          cc.collectContent(n);
          dirtyNodes.push(n);
        }

        cc.notifyNextNode(lastDirtyNode.nextSibling);
        var lines = cc.getLines();
        if ((lines.length <= 1 || lines[lines.length - 1] !== "") &&
            lastDirtyNode.nextSibling) {
          // dirty region doesn't currently end a line, even taking the
          // following node (or lack of node) into account, so include the
          // following clean node. It could be SPAN or a DIV; basically this is
          // any case where the contentCollector decides it isn't done.
          // Note that this clean node might need to be there for the next
          // dirty range.
          b++;
          var cleanLine = lastDirtyNode.nextSibling;
          cc.collectContent(cleanLine);
          toDeleteAtEnd.push(cleanLine);
          cc.notifyNextNode(cleanLine.nextSibling);
        }

        var ccData = cc.finish();
        var ss = ccData.selStart;
        var se = ccData.selEnd;
        lines = ccData.lines;
        var lineAttribs = ccData.lineAttribs;
        var linesWrapped = ccData.linesWrapped;
        if (ccData.newAuthors.length) {
          observer.trigger('missing-authors', [ccData.newAuthors]);
        }

        if (linesWrapped > 0) {
          ace.util.doAlert("Editor warning: " + linesWrapped + " long line" +
              (linesWrapped == 1 ? " was" : "s were") + " hard-wrapped into " +
              ccData.numLinesAfter + " lines.");
        }

        if (ss[0] >= 0) selStart = [ss[0] + a + netNumLinesChangeSoFar, ss[1]];
        if (se[0] >= 0) selEnd = [se[0] + a + netNumLinesChangeSoFar, se[1]];

        var entries = [];
        var nodeToAddAfter = lastDirtyNode;
        var lineNodeInfos = new Array(lines.length);
        for (var k = 0; k < lines.length; k++) {
          var lineString = lines[k];
          var newEntry = createDomLineEntry(lineString);
          entries.push(newEntry);
          lineNodeInfos[k] = newEntry.domInfo;
        }

        //var fragment = magicdom.wrapDom(document.createDocumentFragment());
        domInsertsNeeded.push([nodeToAddAfter, lineNodeInfos]);
        forEach(dirtyNodes, function (n) { toDeleteAtEnd.push(n); });
        var spliceHints = {};
        if (selStart) spliceHints.selStart = selStart;
        if (selEnd) spliceHints.selEnd = selEnd;
        spliceHints.preserveAuthorship = ccData.nestedDomLines;
        // todo: smarts here

        splicesToDo.push([a + netNumLinesChangeSoFar, b - a, entries,
            lineAttribs, spliceHints]);
        netNumLinesChangeSoFar += (lines.length - (b - a));
      } else if (b > a) {
        splicesToDo.push([a + netNumLinesChangeSoFar, b - a, [], []]);
      }

      i++;
    }

    var domChanges = (splicesToDo.length > 0);

    // Performs splices.
    p.mark("splice");
    forEach(splicesToDo, function (splice) {
      doIncorpLineSplice(splice[0], splice[1], splice[2], splice[3], splice[4]);
    });

    // Do DOM inserts.
    p.mark("insert");
    forEach(domInsertsNeeded, function (ins) {
      insertDomLines(ins[0], ins[1], isTimeUp);

      // Optimization for regular typing - don't remove the old dom node,
      // just point the new entry to the old node
      if (domInsertsNeeded.length == 1 && toDeleteAtEnd.length == 1 &&
          ins[0] == toDeleteAtEnd[0]) {
        var newNode = ins[1][0].node;
        var oldNode = toDeleteAtEnd[0];
        oldNode.id = newNode.id;
        if (newNode.outerHTML == oldNode.outerHTML) {
          toDeleteAtEnd = [newNode];
          self.markNodeClean(oldNode);
          rep.lines.atKey(oldNode.id).lineNode = oldNode;
          rep.lines.atKey(oldNode.id).domInfo.node = oldNode;
        }
      }
    });

    // Delete old dom nodes.
    p.mark("del");
    forEach(toDeleteAtEnd, function (n) {
      // parent of n may not be "root" in IE due to non-tree-shaped DOM (wtf)
      n.parentNode.removeChild(n);
    });

    // If the nodes that define the selection weren't encountered during
    // content collection, figure out where those nodes are now.
    p.mark("findsel");
    if (selection && !selStart) {
      //if (domChanges) dmesg("selection not collected");
      selStart = self.getLineAndCharForPoint(selection.startPoint);
    }
    if (selection && !selEnd) {
      selEnd = self.getLineAndCharForPoint(selection.endPoint);
    }

    // Selection from content collection can, in various ways, extend past final
    // BR in firefox DOM, so cap the line.
    var numLines = rep.lines.length();
    if (selStart && selStart[0] >= numLines) {
      selStart[0] = numLines - 1;
      selStart[1] = rep.lines.atIndex(selStart[0]).text.length;
    }
    if (selEnd && selEnd[0] >= numLines) {
      selEnd[0] = numLines - 1;
      selEnd[1] = rep.lines.atIndex(selEnd[0]).text.length;
    }

    // Update rep if we have a new selection.
    // NOTE: IE loses the selection when you click stuff in e.g. the
    // editbar, so removing the selection when it's lost is not a good
    // idea.
    p.mark("repsel");
    if (selection) {
      repSelectionChange(selStart, selEnd, selection && selection.focusAtStart);
    }

    // Update browser selection.
    p.mark("browsel");
    if (selection && (domChanges || self.isCaret())) {
      // if no DOM changes (not this case), want to treat range selection
      // delicately, e.g. in IE not lose which end of the selection is the
      // focus/anchor; on the other hand, we may have just noticed a press of
      // PageUp/PageDown.
      currentCallStack.selectionAffected = true;
      if (domChanges && self.isCaret() && iOS) {
        // on iOS only, renumber lists agressively whenever editing
        // a list (because our enter handlers do not run)
        self.renumberList(selStart[0], true/*conservative*/);
      }
    }

    // Update the selection toolbar as necessary.
    self.updateToolbarIfNecessary(selection, self.isCaret(), selection &&
        Math.abs(selEnd[0] - selStart[0]) > 1 /* isMultiline */);

    currentCallStack.domClean = true;
    // Fix up the current view.
    p.mark("fixview");
    fixView();

    p.end("END");
    return domChanges;
  }

  /**
   * This seems to be important mainly in making sure that rep is up-to-date.
   */
  self.fastIncorp = function() {
    // normalize but don't do any lexing or anything
    incorporateUserChanges(ace.util.newTimeLimit(0));
  }

  /**
   * Tries to the latest changes quickly, if possible, in conjunction mainly
   * with keystrokes.
   * @return {boolean} Whether we're still under 5 failures.
   */
  self.incorpIfQuick = function() {
    var me = self.incorpIfQuick;
    var failures = (me.failures || 0);
    if (failures < 5) {
      var isTimeUp = ace.util.newTimeLimit(40);
      var madeChanges = incorporateUserChanges(isTimeUp);
      if (isTimeUp()) {
        me.failures = failures + 1;
      } // TODO: should this add: else me.failures = 0  ??
      return true;
    } else {
      var skipCount = (me.skipCount || 0);
      skipCount++;
      if (skipCount == 20) {
        skipCount = 0;
        me.failures = 0;
      }
      me.skipCount = skipCount;
    }
    return false;
  }

  /**
   * Create information about a DOM node.
   * @param {string} lineString The text of the node.
   * @return {Object} Information about the DOM node.
   */
  function createDomLineEntry(lineString) {
    function onEmbed(url, callback) {
      observer.trigger('embed', [url, callback]);
    }

    function onEmbedCreation(event) {
      invalidateCache();
      var magicDomNode = self.findMagicDomNode(event.target);
      magicDomNode && self.markNodeClean(magicDomNode);
    }

    var info = domline.createDomLine(
        lineString.length > 0,
        true /* doesWrap */,
        browser,
        document,
        null /* optRelativeUrlPrefix */,
        onEmbed,
        self.onMath,
        null /* optForEmail */,
        onEmbedCreation,
        self.getAuthorInfos());
    var newNode = info.node;

    return {
      key: uniqueId(newNode),
      text: lineString,
      lineNode: newNode,
      domInfo: info,
      lineMarker: 0
    };
  }


  /***************************************************************************
   * Insertion.
   ***************************************************************************/

  /**
   * Insert DOM lines as necessary.
   * @param {Element} nodeToAddAfter .
   * @param {Array.<Object>} infoStructs A structure of a type returned
   *     by the function doCreateDomLine.
   * @param {Function} isTimeUp Whether our allocated time is up.
   */
  function insertDomLines(nodeToAddAfter, infoStructs, isTimeUp) {
    isTimeUp = (isTimeUp || function() { return false; });

    var lastEntry;
    var lineStartOffset;
    if (infoStructs.length < 1) return;
    var startEntry = rep.lines.atKey(uniqueId(infoStructs[0].node));
    var endEntry = rep.lines.atKey(uniqueId(
        infoStructs[infoStructs.length - 1].node));
    var charStart = rep.lines.offsetOfEntry(startEntry);
    var charEnd = rep.lines.offsetOfEntry(endEntry) + endEntry.width;

    //rep.lexer.lexCharRange([charStart, charEnd], isTimeUp);

    forEach(infoStructs, function (info) {
      var p2 = PROFILER("insertLine", false);
      var node = info.node;
      var key = uniqueId(node);
      var entry;
      p2.mark("findEntry");

      if (lastEntry) {
        // optimization to avoid recalculation
        var next = rep.lines.next(lastEntry);
        if (next && next.key == key) {
          entry = next;
          lineStartOffset += lastEntry.width;
        }
      }

      if (!entry) {
        p2.literal(1, "nonopt");
        entry = rep.lines.atKey(key);
        lineStartOffset = rep.lines.offsetOfKey(key);
      } else {
        p2.literal(0, "nonopt");
      }

      lastEntry = entry;
      p2.mark("spans");
      self.getSpansForLine(entry, function (tokenText, tokenClass) {
        info.appendSpan(tokenText, tokenClass);
      }, lineStartOffset, isTimeUp());
      //else if (entry.text.length > 0) {
      //info.appendSpan(entry.text, 'dirty');
      //}

      p2.mark("addLine");
      info.prepareForAdd();
      entry.lineMarker = info.lineMarker;
      if (!nodeToAddAfter) {
        root.insertBefore(node, root.firstChild);
      } else {
        root.insertBefore(node, nodeToAddAfter.nextSibling);
      }

      nodeToAddAfter = node;
      info.notifyAdded();
      p2.mark("markClean");
      self.markNodeClean(node);
      p2.end();
    });
  }

  /**
   * Like getSpansForRange, but for a line, and the func takes (text, class)
   * instead of (width, class); excludes the trailing '\n' from
   * consideration by func.  We run filteredFunc(LineEntry.text, '') which deep
   * down calls textAndClassFunc repeatedly.
   *
   * @param {key: uniqueId(newNode), text: lineString, lineNode: newNode,
   *     domInfo: info, lineMarker: 0} lineEntry
   * @param {function(text, class)} textAndClassFunc Function that does
   *     domline.appendSpan(text,class)
  */
  self.getSpansForLine = function(lineEntry, textAndClassFunc) {
    var text = lineEntry.text;
    var width = lineEntry.width; // text.length + 1

    if (text.length == 0) {
      // allow getLineStyleFilter to set line-div styles
      var func = linestylefilter.getLineStyleFilter(
        0, '', textAndClassFunc, rep.apool);
      func('', '');
    } else {
      var offsetIntoLine = 0;
      var lineNum = rep.lines.indexOfEntry(lineEntry);
      var lang = self.getLangForCodeLine(lineNum);  // syntax highlighting
      var lexerState = null;

      if (lang || textFace == "monospace") {
        lexerState = "start";
        for (var maxLines = 5, tempEntry = rep.lines.prev(lineEntry);
             maxLines && tempEntry;
             maxLines--, tempEntry = rep.lines.prev(tempEntry)) {

          // stop at the first non-code line
          if (!tempEntry.domInfo.node.children[0]) {
            // We get here in IE which sometimes doesn't have the child.
            break;
          }

          var c = tempEntry.domInfo.node.children[0].className.
              match(/list-code/);
          if (!c || !c.length) {
            break;
          }

          var m = tempEntry.domInfo.node.className.match(/lexer_(\S+)/);
          if (m && m[1]) {
            lexerState = m[1];
            break;
          }
        }
      }

      var tok = self.getTokenizer(lang);
      var listType = self.getLineListType(lineNum);
      var filteredFunc = linestylefilter.getFilterStack(text, textAndClassFunc,
          browser,
          textFace != "monospace" && !lang && listType.indexOf('code') == -1,
          lexerState, (lineNum > 0 && tok) ? tok : null);

      var aline = rep.alines[lineNum];
      filteredFunc = linestylefilter.getLineStyleFilter(
          text.length, aline, filteredFunc, rep.apool);
      filteredFunc(text, '');
    }
  }


  /***************************************************************************
   * Splicing.
   ***************************************************************************/

  /**
   * Change the abstract representation of the document to have a different set
   * of lines.  Must be called after rep.alltext is set.
   * @param {number} startLine .
   * @param {number} deleteCount The number of lines to remove.
   * @param {Object} newLineEntries The lines to insert.
   */
  function doRepLineSplice(startLine, deleteCount, newLineEntries) {
    forEach(newLineEntries, function (entry) {
      entry.width = entry.text.length + 1;
    });

    var startOldChar = rep.lines.offsetOfIndex(startLine);
    var endOldChar = rep.lines.offsetOfIndex(startLine + deleteCount);

    var oldRegionStart = rep.lines.offsetOfIndex(startLine);
    var oldRegionEnd = rep.lines.offsetOfIndex(startLine + deleteCount);
    rep.lines.splice(startLine, deleteCount, newLineEntries);
    currentCallStack.docTextChanged = true;
    currentCallStack.repChanged = true;
    var newRegionEnd = rep.lines.offsetOfIndex(
        startLine + newLineEntries.length);
    var newText = map(newLineEntries,
        function (e) { return e.text+'\n'; }).join('');

    rep.alltext = rep.alltext.substring(0, startOldChar) + newText +
      rep.alltext.substring(endOldChar, rep.alltext.length);
    //var newTotalLength = rep.alltext.length;
    //rep.lexer.updateBuffer(rep.alltext, oldRegionStart, oldRegionEnd -
    //    oldRegionStart,
    //newRegionEnd - oldRegionStart);
  }

  /**
   * Splices in new lines.
   * @param {number} startLine .
   * @param {number} deleteCount The number of lines to remove.
   * @param {Object} newLineEntries The lines to insert.
   * @param {Array} lineAttribs .
   * @param {Object} hints Can include selStart, selEnd, preserveAuthorship.
   */
  function doIncorpLineSplice(startLine, deleteCount, newLineEntries,
      lineAttribs, hints) {
    var startOldChar = rep.lines.offsetOfIndex(startLine);
    var endOldChar = rep.lines.offsetOfIndex(startLine+deleteCount);
    var oldRegionStart = rep.lines.offsetOfIndex(startLine);
    var selStartHintChar, selEndHintChar;

    if (hints && hints.selStart) {
      selStartHintChar = rep.lines.offsetOfIndex(
          hints.selStart[0]) + hints.selStart[1] - oldRegionStart;
    }
    if (hints && hints.selEnd) {
      selEndHintChar = rep.lines.offsetOfIndex(
          hints.selEnd[0]) + hints.selEnd[1] - oldRegionStart;
    }

    var newText = map(newLineEntries, function (e) {
      return e.text + '\n';
    }).join('');
    var oldText = rep.alltext.substring(startOldChar, endOldChar);
    var oldAttribs = rep.alines.slice(startLine,
        startLine + deleteCount).join('');
    // not valid in a changeset
    var newAttribs = lineAttribs.join('|1+1') + '|1+1';
    var analysis = analyzeChange(oldText, newText, oldAttribs, newAttribs,
        selStartHintChar, selEndHintChar);
    var commonStart = analysis[0];
    var commonEnd = analysis[1];
    var shortOldText = oldText.substring(commonStart,
        oldText.length - commonEnd);
    var shortNewText = newText.substring(commonStart,
        newText.length - commonEnd);
    var spliceStart = startOldChar + commonStart;
    var spliceEnd = endOldChar - commonEnd;
    var shiftFinalNewlineToBeforeNewText = false;

    // adjust the splice to not involve the final newline of the document;
    // be very defensive
    if (shortOldText.charAt(shortOldText.length - 1) == '\n' &&
        shortNewText.charAt(shortNewText.length - 1) == '\n') {
      // replacing text that ends in newline with text that also ends in newline
      // (still, after analysis, somehow)
      shortOldText = shortOldText.slice(0, -1);
      shortNewText = shortNewText.slice(0, -1);
      spliceEnd--;
      commonEnd++;
    }

    if (shortOldText.length == 0 && spliceStart == rep.alltext.length &&
        shortNewText.length > 0) {
      // inserting after final newline, bad
      spliceStart--;
      spliceEnd--;
      shortNewText = '\n' + shortNewText.slice(0, -1);
      shiftFinalNewlineToBeforeNewText = true;
    }

    if (spliceEnd == rep.alltext.length && shortOldText.length > 0 &&
        shortNewText.length == 0) {
      // deletion at end of rep.alltext
      if (rep.alltext.charAt(spliceStart - 1) == '\n') {
        // (if not then what the heck?  it will definitely lead
        // to a rep.alltext without a final newline)
        spliceStart--;
        spliceEnd--;
      }
    }

    if (!(shortOldText.length == 0 && shortNewText.length == 0)) {
      var oldDocText = rep.alltext;
      var oldLen = oldDocText.length;

      var spliceStartLine = rep.lines.indexOfOffset(spliceStart);
      var spliceStartLineStart = rep.lines.offsetOfIndex(spliceStartLine);
      function startBuilder() {
        var builder = Changeset.builder(oldLen);
        builder.keep(spliceStartLineStart, spliceStartLine);
        builder.keep(spliceStart - spliceStartLineStart);
        return builder;
      }

      function eachAttribRun(attribs,
          func/*(startInNewText, endInNewText, attribs)*/) {
        var attribsIter = Changeset.opIterator(attribs);
        var textIndex = 0;
        var newTextStart = commonStart;
        var newTextEnd = newText.length - commonEnd -
            (shiftFinalNewlineToBeforeNewText ? 1 : 0);
        while (attribsIter.hasNext()) {
          var op = attribsIter.next();
          var nextIndex = textIndex + op.chars;
          if (!(nextIndex <= newTextStart || textIndex >= newTextEnd)) {
            func(Math.max(newTextStart, textIndex),
                Math.min(newTextEnd, nextIndex), op.attribs);
          }

          textIndex = nextIndex;
        }
      }

      var justApplyStyles = (shortNewText == shortOldText);
      var theChangeset;

      if (justApplyStyles) {
        // create changeset that clears the incorporated styles on
        // the existing text.  we compose this with the
        // changeset the applies the styles found in the DOM.
        // This allows us to incorporate, e.g., Safari's native "unbold".

        var incorpedAttribClearer = ace.util.cachedStrFunc(function (oldAtts) {
          return Changeset.mapAttribNumbers(oldAtts, function(n) {
            var k = rep.apool.getAttribKey(n);
            if (isStyleAttribute(k)) {
              return rep.apool.putAttrib([k, '']);
            }

            return false;
          });
        });

        var builder1 = startBuilder();
        if (shiftFinalNewlineToBeforeNewText) {
          builder1.keep(1, 1);
        }
        eachAttribRun(oldAttribs, function(start, end, attribs) {
          builder1.keepText(newText.substring(start, end),
              incorpedAttribClearer(attribs));
        });
        var clearer = builder1.toString();

        var builder2 = startBuilder();
        if (shiftFinalNewlineToBeforeNewText) {
          builder2.keep(1, 1);
        }
        eachAttribRun(newAttribs, function(start, end, attribs) {
          builder2.keepText(newText.substring(start, end), attribs);
        });
        var styler = builder2.toString();

        theChangeset = Changeset.compose(clearer, styler, rep.apool);
      } else {
        var builder = startBuilder();
        var spliceEndLine = rep.lines.indexOfOffset(spliceEnd);
        var spliceEndLineStart = rep.lines.offsetOfIndex(spliceEndLine);
        if (spliceEndLineStart > spliceStart) {
          builder.remove(spliceEndLineStart - spliceStart,
              spliceEndLine - spliceStartLine);
          builder.remove(spliceEnd - spliceEndLineStart);
        } else {
          builder.remove(spliceEnd - spliceStart);
        }

        var isNewTextMultiauthor = false;
        var authorAtt = Changeset.makeAttribsString(
          '+', (thisAuthor ? [['author', thisAuthor]] : []), rep.apool);
        var authorizer = ace.util.cachedStrFunc(function(oldAtts) {
          var preserveAuthorship = hints && hints.preserveAuthorship;
          if (preserveAuthorship ||
              isNewTextMultiauthor/* || shortOldText.length == 0*/) {
            // prefer colors from DOM
            return Changeset.composeAttributes(authorAtt, oldAtts, true,
                rep.apool);
          } else {
            // use this author's color
            return Changeset.composeAttributes(oldAtts, authorAtt, true,
                rep.apool);
          }
        });

        var foundDomAuthor = '';
        eachAttribRun(newAttribs, function(start, end, attribs) {
          var a = Changeset.attribsAttributeValue(attribs, 'author', rep.apool);
          if (a && a != foundDomAuthor) {
            if (! foundDomAuthor) {
              foundDomAuthor = a;
            } else {
              isNewTextMultiauthor = true; // multiple authors in DOM!
            }
          }
        });

        if (shiftFinalNewlineToBeforeNewText) {
          builder.insert('\n', authorizer(''));
        }

        eachAttribRun(newAttribs, function(start, end, attribs) {
          builder.insert(newText.substring(start, end), authorizer(attribs));
        });
        theChangeset = builder.toString();
      }

      //dmesg(htmlPrettyEscape(theChangeset));

      doRepApplyChangeset(theChangeset);
    }

    // do this no matter what, because we need to get the right
    // line keys into the rep.
    doRepLineSplice(startLine, deleteCount, newLineEntries);
  }

  /**
   * When splicing, analyze the change to find a common start and end.
   * @param {string} oldText .
   * @param {string} newText .
   * @param {string} oldAttribs .
   * @param {string} newAttribs .
   * @param {Array.<number>} optSelStartHint Line/column start of range.
   * @param {Array.<number>} optSelEndHint Line/column end of range.
   */
  function analyzeChange(oldText, newText, oldAttribs, newAttribs,
      optSelStartHint, optSelEndHint) {
    function incorpedAttribFilter(anum) {
      return isStyleAttribute(rep.apool.getAttribKey(anum));
    }

    function attribRuns(attribs) {
      var lengs = [];
      var atts = [];
      var iter = Changeset.opIterator(attribs);
      while (iter.hasNext()) {
        var op = iter.next();
        lengs.push(op.chars);
        atts.push(op.attribs);
      }
      return [lengs, atts];
    }

    function attribIterator(runs, backward) {
      var lengs = runs[0];
      var atts = runs[1];
      var i = (backward ? lengs.length - 1 : 0);
      var j = 0;

      return function next() {
        while (j >= lengs[i]) {
          if (backward) i--; else i++;
          j = 0;
        }

        var a = atts[i];
        j++;

        return a;
      };
    }

    var oldLen = oldText.length;
    var newLen = newText.length;
    var minLen = Math.min(oldLen, newLen);
    var oldARuns = attribRuns(Changeset.filterAttribNumbers(oldAttribs,
        incorpedAttribFilter));
    var newARuns = attribRuns(Changeset.filterAttribNumbers(newAttribs,
        incorpedAttribFilter));
    var commonStart = 0;
    var oldStartIter = attribIterator(oldARuns, false);
    var newStartIter = attribIterator(newARuns, false);
    while (commonStart < minLen) {
      if (oldText.charAt(commonStart) == newText.charAt(commonStart) &&
          oldStartIter() == newStartIter()) {
        commonStart++;
      } else {
        break;
      }
    }

    var commonEnd = 0;
    var oldEndIter = attribIterator(oldARuns, true);
    var newEndIter = attribIterator(newARuns, true);
    while (commonEnd < minLen) {
      if (commonEnd == 0) {
        // assume newline in common
        oldEndIter();
        newEndIter();
        commonEnd++;
      } else if (oldText.charAt(oldLen - 1 - commonEnd) ==
          newText.charAt(newLen - 1 - commonEnd) &&
          oldEndIter() == newEndIter()) {
        commonEnd++;
      } else {
        break;
      }
    }

    var hintedCommonEnd = -1;
    if ((typeof optSelEndHint) == "number") {
      hintedCommonEnd = newLen - optSelEndHint;
    }

    if (commonStart + commonEnd > oldLen) {
      // ambiguous insertion
      var minCommonEnd = oldLen - commonStart;
      var maxCommonEnd = commonEnd;
      if (hintedCommonEnd >= minCommonEnd && hintedCommonEnd <= maxCommonEnd) {
        commonEnd = hintedCommonEnd;
      } else {
        commonEnd = minCommonEnd;
      }
      commonStart = oldLen - commonEnd;
    }

    if (commonStart + commonEnd > newLen) {
      // ambiguous deletion
      var minCommonEnd = newLen - commonStart;
      var maxCommonEnd = commonEnd;
      if (hintedCommonEnd >= minCommonEnd && hintedCommonEnd <= maxCommonEnd) {
        commonEnd = hintedCommonEnd;
      } else {
        commonEnd = minCommonEnd;
      }
      commonStart = newLen - commonEnd;
    }

    return [commonStart, commonEnd];
  }


  /***************************************************************************
   * Changesets.
   ***************************************************************************/

  /**
   * Change the abstract representation of the rep with a changeset.
   * @param {Object} changes .
   * @param {boolean} insertsAfterSelection The new text goes after the range.
   */
  function doRepApplyChangeset(changes, insertsAfterSelection) {
    Changeset.checkRep(changes);

    if (Changeset.oldLen(changes) != rep.alltext.length) {
      var msg = "doRepApplyChangeset length mismatch: " +
        Changeset.oldLen(changes) + "/" + rep.alltext.length;
      window['onfreakout'] && window['onfreakout'](msg);
      throw new Error(msg);
    }

    (function doRecordUndoInformation(changes) {
      var editEvent = currentCallStack.editEvent;
      if (editEvent.eventType == "nonundoable") {
        if (! editEvent.changeset) {
          editEvent.changeset = changes;
        } else {
          editEvent.changeset = Changeset.compose(editEvent.changeset, changes,
              rep.apool);
        }
      } else {
        var inverseChangeset = Changeset.inverse(changes,
            { get: function(i) { return rep.lines.atIndex(i).text + '\n'; },
              length: function() { return rep.lines.length(); }
            },
            rep.alines, rep.apool);

        if (!editEvent.backset) {
          editEvent.backset = inverseChangeset;
        } else {
          editEvent.backset = Changeset.compose(inverseChangeset,
              editEvent.backset, rep.apool);
        }
      }
    })(changes);

    //rep.alltext = Changeset.applyToText(changes, rep.alltext);
    Changeset.mutateAttributionLines(changes, rep.alines, rep.apool);

    if (self.isTracking()) {
      self.composeUserChangeset(changes);
    }
  }

  /**
   * Applies a changeset to the document.
   * @param {Object} changes .
   * @param {boolean} insertsAfterSelection The new text goes after the range.
   */
  self.performDocumentApplyChangeset = function(changes,
      insertsAfterSelection) {
    doRepApplyChangeset(changes, insertsAfterSelection);

    var requiredSelectionSetting = null;
    if (rep.selStart && rep.selEnd) {
      var selStartChar = rep.lines.offsetOfIndex(rep.selStart[0]) +
          rep.selStart[1];
      var selEndChar = rep.lines.offsetOfIndex(rep.selEnd[0]) + rep.selEnd[1];
      var result = Changeset.characterRangeFollow(changes, selStartChar,
          selEndChar, insertsAfterSelection);
      requiredSelectionSetting = [result[0], result[1], rep.selFocusAtStart];
    }

    var linesMutatee = {
      splice: function(start, numRemoved, newLinesVA) {
        domAndRepSplice(start, numRemoved,
            map(Array.prototype.slice.call(arguments, 2),
                function(s) { return s.slice(0, -1); }),
            null);
      },
      get: function(i) { return rep.lines.atIndex(i).text + '\n'; },
      length: function() { return rep.lines.length(); },
      slice_notused: function(start, end) {
        return map(rep.lines.slice(start, end),
            function(e) { return e.text + '\n'; });
      }
    };

    Changeset.mutateTextLines(changes, linesMutatee);

    if (requiredSelectionSetting) {
      self.performSelectionChange(
          self.lineAndColumnFromChar(requiredSelectionSetting[0]),
          self.lineAndColumnFromChar(requiredSelectionSetting[1]),
          requiredSelectionSetting[2]);
    }

    function domAndRepSplice(startLine, deleteCount, newLineStrings, isTimeUp) {
      // dgreensp 3/2009: the spliced lines may be in the middle of a
      // dirty region, so if no explicit time limit, don't spend a lot of time
      // highlighting
      isTimeUp = (isTimeUp || ace.util.newTimeLimit(50));

      var keysToDelete = [];
      if (deleteCount > 0) {
        var entryToDelete = rep.lines.atIndex(startLine);
        for(var i = 0; i < deleteCount; i++) {
          keysToDelete.push(entryToDelete.key);
          entryToDelete = rep.lines.next(entryToDelete);
        }
      }

      var lineEntries = map(newLineStrings, createDomLineEntry);

      doRepLineSplice(startLine, deleteCount, lineEntries);

      var nodeToAddAfter;
      if (startLine > 0) {
        nodeToAddAfter = getCleanNodeByKey(
            rep.lines.atIndex(startLine - 1).key);
      } else {
        nodeToAddAfter = null;
      }

      // optimization: if the innerHTML of a particular line we're going to
      // remove is equivalent to the innerHTML of a line we're adding, reuse
      // thenode
      insertDomLines(nodeToAddAfter, map(lineEntries,
          function (entry) { return entry.domInfo; }), isTimeUp);

      // if we're applying changes to a table, go ahead
      // and just apply the new state of the table - don't re-create the node
      if (lineEntries.length == 1 && keysToDelete.length == 1) {
        keysToDelete = self.domAndRepSpliceToTable(lineEntries, keysToDelete,
            startLine);
      }

      forEach(keysToDelete, function (k) {
        var n = document.getElementById(k);
        n.parentNode.removeChild(n);
      });

      if ((rep.selStart && rep.selStart[0] >= startLine &&
          rep.selStart[0] <= startLine+deleteCount) ||
          (rep.selEnd && rep.selEnd[0] >= startLine &&
          rep.selEnd[0] <= startLine+deleteCount)) {
        currentCallStack.selectionAffected = true;
      }
    }
  }


  /***************************************************************************
   * Attributes.
   ***************************************************************************/

  /**
   * Sets attribute on a selection.
   * @param {string} attributeName .
   * @param {string} attributeValue .
   */
  self.setAttributeOnSelection = function(attributeName, attributeValue) {
    if (!(rep.selStart && rep.selEnd)) return;

    self.performDocumentApplyAttributesToRange(rep.selStart, rep.selEnd,
        [[attributeName, attributeValue]]);
  }

  /**
   * Sets attribute on a line.
   * @param {number} line .
   * @param {string} attributeName .
   * @param {string} attributeValue .
   */
  self.setAttributeOnLine = function(line, attributeName, value) {
    var start = [line, 0];
    var end = [line + 1, 0];
    self.performDocumentApplyAttributesToRange(start, end,
        [[attributeName, value ? 'true' : '']]);
  }

  /**
   * Toggles attribute on a selection.
   * @param {string} attributeName .
   */
  self.toggleAttributeOnSelection = function(attributeName) {
    if (document.activeElement.id == "sheet-id") {
      document.activeElement.triggerAttrToggle(
          {'bold':'b', 'italic':'i', 'underline': 'u',
          'strikethrough': 'del'}[attributeName]);
      return false;
    }

    if (!(rep.selStart && rep.selEnd)) return;

    // new toggle bold/italic/underline handling
    if (self.isCaret() && document.execCommand &&
        _contains(["bold", "italic", "underline", "strikethrough"],
        attributeName)) {
      document.execCommand(attributeName);
    }

    var selectionAllHasIt = true;
    var withIt = Changeset.makeAttribsString('+', [[attributeName, 'true']],
        rep.apool);
    var withItRegex = new RegExp(withIt.replace(/\*/g,'\\*') + "(\\*|$)");
    function hasIt(attribs) { return withItRegex.test(attribs); }

    var selStartLine = rep.selStart[0];
    var selEndLine = rep.selEnd[0];
    for (var n = selStartLine; n <= selEndLine; n++) {
      var opIter = Changeset.opIterator(rep.alines[n]);
      var indexIntoLine = 0;
      var selectionStartInLine = 0;
      // exclude newline
      var selectionEndInLine = rep.lines.atIndex(n).text.length;
      if (n == selStartLine) {
        selectionStartInLine = rep.selStart[1];
      }
      if (n == selEndLine) {
        selectionEndInLine = rep.selEnd[1];
      }

      while (opIter.hasNext()) {
        var op = opIter.next();
        var opStartInLine = indexIntoLine;
        var opEndInLine = opStartInLine + op.chars;
        if (! hasIt(op.attribs)) {
          // does op overlap selection?
          if (!(opEndInLine <= selectionStartInLine ||
              opStartInLine >= selectionEndInLine)) {
            selectionAllHasIt = false;
            break;
          }
        }
        indexIntoLine = opEndInLine;
      }

      if (!selectionAllHasIt) {
        break;
      }
    }

    if (selectionAllHasIt) {
      self.performDocumentApplyAttributesToRange(rep.selStart, rep.selEnd,
          [[attributeName, '']]);
    } else {
      self.performDocumentApplyAttributesToRange(rep.selStart, rep.selEnd,
          [[attributeName, 'true']]);
    }
  }


  /***************************************************************************
   * Selection.
   ***************************************************************************/

  /**
   * Begins a selection change.
   * @param {Array.<number>} selectStart The line/column of the range start.
   * @param {Array.<number>} selectEnd The line/column of the range end.
   * @param {boolean} focusAtStart Whether to focus at start].
   */
  self.performSelectionChange = function(selectStart, selectEnd, focusAtStart) {
    if (repSelectionChange(selectStart, selectEnd, focusAtStart)) {
      currentCallStack.selectionAffected = true;
    }
  }


  /**
   * Change the abstract representation of the document to have a different
   * selection.
   * Should not rely on the line representation.  Should not affect the DOM.
   * @param {Array.<number>} selectStart The line/column of the range start.
   * @param {Array.<number>} selectEnd The line/column of the range end.
   * @param {boolean} focusAtStart Whether to focus at start].
   * @return {boolean} Whether the selection was modified.
   */
  function repSelectionChange(selectStart, selectEnd, focusAtStart) {
    focusAtStart = !!focusAtStart;
    var newSelFocusAtStart = (focusAtStart &&
        ((!selectStart) || (!selectEnd) ||
            (selectStart[0] != selectEnd[0]) ||
            (selectStart[1] != selectEnd[1])));

    if (((!ace.util.equalLineAndChars(rep.selStart, selectStart)) ||
        (!ace.util.equalLineAndChars(rep.selEnd, selectEnd)) ||
        (rep.selFocusAtStart != newSelFocusAtStart))) {
      rep.selStart = selectStart;
      rep.selEnd = selectEnd;
      rep.selFocusAtStart = newSelFocusAtStart;
      currentCallStack.repChanged = true;
      return true;
    }

    return false;
  }


  /***************************************************************************
   * Undo/redo.
   ***************************************************************************/

  /**
   * Performs an undo/redo operation.
   * @param {string} which Either 'undo' or 'redo'.
   */
  self.doUndoRedo = function(which) {
    // precond: normalized DOM
    if (undoModule.enabled) {
      var whichMethod;
      if (which == "undo") whichMethod = 'performUndo';
      if (which == "redo") whichMethod = 'performRedo';
      if (whichMethod) {
        var oldEventType = currentCallStack.editEvent.eventType;
        currentCallStack.startNewEvent(which);
        undoModule[whichMethod](function(backset, selectionInfo) {
          if (backset) {
            self.performDocumentApplyChangeset(backset);
          }
          if (selectionInfo) {
            self.performSelectionChange(
                self.lineAndColumnFromChar(selectionInfo.selStart),
                self.lineAndColumnFromChar(selectionInfo.selEnd),
                selectionInfo.selFocusAtStart);
          }
          var oldEvent = currentCallStack.startNewEvent(oldEventType, true);
          return oldEvent;
        });
      }
    }
  }

  /**
   * @param {string} which Either 'undo' or 'redo'.
   * @return {boolean} Whether undo/redo is possible.
   */
  self.canUndoRedo = function(which) {
    if (!undoModule.enabled) {
      return false;
    }
    if (which == "undo") {
      return undoModule.canPerformUndo();
    }
    if (which == "redo") {
      return undoModule.canPerformRedo();
    }
    return false;
  }


  /***************************************************************************
   * Utilities.
   ***************************************************************************/

  /**
   * Fix the editor root node to correct sizes and other quirks.
   * Calling this method repeatedly should be fast.
   */
  function fixView() {
    if (getInnerWidth() == 0 || getInnerHeight() == 0) {
      return;
    }

    function setIfNecessary(obj, prop, value) {
      if (obj[prop] != value) {
        obj[prop] = value;
        return true;
      }
      return false;
    }

    // XXX why is this looping through twice?
    for (var i = 0; i < 2; i++) {
      var newHeight = $(root).outerHeight();
      var viewHeight = getInnerHeight();
      if (newHeight < viewHeight) {
        // FIXME: View is always bigger, since hackpad uses outer scroll
        // bars.
        // newHeight = viewHeight;
        if (browser.msie)
          setIfNecessary(document.documentElement.style, 'overflowY', 'auto');
      } else {
        if (browser.msie)
          setIfNecessary(document.documentElement.style, 'overflowY', 'scroll');
      }

      if (currentHeight != newHeight) {
        currentHeight = newHeight;
        observer.trigger('height-change', [newHeight]);
      }
    }

    if (browser.mozilla) {
      setIfNecessary(root.style, "height", "");
    }

    enforceEditability();
  }

  /**
   * Ensures the DOM node is set to the proper editability setting we would
   * like.
   */
  function enforceEditability() {
    self.setEditable(isEditable);
  }

  /**
   * Make the root DOM node contenteditable.
   * @param {boolean} newVal .
   */
  self.setEditable = function(newVal) {
    isEditable = newVal;

    // the following may fail, e.g. if iframe is hidden
    if (!isEditable) {
      setDesignMode(false);
    } else {
      setDesignMode(true);
    }

    // disable object (image) resizing in ie and ff
    if (browser.mozilla) {
      try {
        document.execCommand('enableObjectResizing', false, false);
      } catch(ex) { /* ignored */ }
    } else if (browser.ie) {
      $(document).on('onresizestart',
          function (evt) {
            evt.data.preventDefault();
          });
    }

    setClassPresence(root, "static", ! isEditable);
  }

  /**
   * Sets editability of the document as desired.
   * @param {boolean} newVal .
   */
  function setDesignMode(newVal) {
    try {
      function setIfNecessary(target, prop, val) {
        if (String(target[prop]).toLowerCase() != val) {
          target[prop] = val;
          return true;
        }
        return false;
      }
      if (browser.msie || browser.safari || browser.mozilla) {
        setIfNecessary(root, 'contentEditable', (newVal ? 'true' : 'false'));
      } else {
        var wasSet = setIfNecessary(document, 'designMode',
            (newVal ? 'on' : 'off'));
        if (wasSet && newVal && browser.opera) {
          // turning on designMode clears event handlers
          bindTheEventHandlers();
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Finds a parent DOM node in our editor, given a child within in a line.
   * @param {Element} n .
   * @return {Element} A 'magic' DOM node - encompasses one line of the doc.
   */
  self.findMagicDomNode = function(n) {
    while (n && n.parentNode != root) {
      n = n.parentNode;
    }

    return n;
  }

  /** @return {boolean} Whether a character is non-whitespace. */
  self.isWordChar = function(c) {
    return !!REGEX_WORDCHAR.exec(c);
  }

  /** @return {boolean} Whether a character is whitespace. */
  function isSpaceChar(c) {
    return !!REGEX_SPACE.exec(c);
  }

  /**
   * @param {number} line .
   * @param {number} chr .
   * @return {Array.<number>} Line/column set.
   */
  function markerlessLineAndChar(line, chr) {
    return [line, chr - rep.lines.atIndex(line).lineMarker];
  }

  /**
   * @param {number} line .
   * @param {number} chr .
   * @return {Array.<number>} Line/column set.
   */
  self.markerfulLineAndChar = function(line, chr) {
    return [line, chr + rep.lines.atIndex(line).lineMarker];
  }

  /**
   * Trigger a cache purge for things like authors on lines, line numbers, etc.
   */
  function invalidateCache() {
    observer.trigger('invalidate-cache');
  }

  /**
   * Get a 'magic' top level line-node, given an ID.  Will reset the node id
   * to '' temporarily if it's dirty.
   * @param {string} key DOM id.
   * @return {Element} The node we're interested in.
   */
  function getCleanNodeByKey(key) {
    var p = PROFILER("getCleanNodeByKey", false);
    p.extra = 0;
    var n = document.getElementById(key);
    // copying and pasting can lead to duplicate ids
    while (n && self.isNodeDirty(n)) {
      p.extra++;
      n.id = "";
      n = document.getElementById(key);
    }
    p.literal(p.extra, "extra");
    p.end();

    return n;
  }

  /**
   * @param {Element} n .
   * @return {string} The new id of the DOM node.
   */
  function uniqueId(n) {
    // not actually guaranteed to be unique, e.g. if user copy-pastes
    // nodes with ids
    var nid = n.id;
    if (nid) return nid;
    return (n.id = "magicdomid"+(_nextId++));
  }

  function isStyleAttribute(aname) {
    return !!STYLE_ATTRIBS[aname];
  }

  /** @return {boolean} Whether our current selection is collapsed. */
  self.isCaret = function() {
    return (rep.selStart && rep.selEnd &&
        rep.selStart[0] == rep.selEnd[0] &&
        rep.selStart[1] == rep.selEnd[1]);
  }
  self.caretLine = function() { return rep.selStart[0]; }
  self.caretColumn = function() { return rep.selStart[1]; }
  self.caretDocChar = function() {
    return rep.lines.offsetOfIndex(self.caretLine()) + self.caretColumn();
  }

  /**
   * @return {Object} The current word that our selection is around.
   */
  self.caretWord = function() {
    var docChar = self.caretDocChar() - 1;
    while (docChar > 0 && !isSpaceChar(rep.alltext.charAt(docChar)) &&
        rep.alltext.charAt(docChar) != '*') {
      docChar--;
    }
    docChar++;

    var start = self.lineAndColumnFromChar(docChar);
    var word = '';
    while (!isSpaceChar(rep.alltext.charAt(docChar)) &&
        docChar < rep.alltext.length) {
      word += rep.alltext.charAt(docChar);
      docChar++;
    }

    var end = self.lineAndColumnFromChar(docChar);

    return { word: word, start: start, end: end };
  }

  /**
   * @param {number} x The position in the text.
   * @return {Array.<number>} The corresponding rep for that position.
   */
  self.lineAndColumnFromChar = function(x) {
    var lineEntry = rep.lines.atOffset(x);
    var lineStart = rep.lines.offsetOfEntry(lineEntry);
    var lineNum = rep.lines.indexOfEntry(lineEntry);
    return [lineNum, x - lineStart];
  }

  /**
   * @param {Array.<number>} pos The corresponding rep for that position.
   * @return {number} The position in the text.
   */
  self.charFromLineAndColumn = function(pos) {
    var lineNum = pos[0];
    var lineStart = rep.lines.offsetOfIndex(lineNum);
    var col = pos[1];
    return lineStart + col;
  }

  // XXX TODO: Hacky way of getting this function out - problem is that
  // the embed functions are static methods :-/
  function onEmbedResize(embedOuter) {
    invalidateCache();
    self.markNodeClean(self.findMagicDomNode(embedOuter));
  }
  window.onEmbedResize = onEmbedResize;


  /***************************************************************************
   * iOS specific.
   ***************************************************************************/

  /**
   * Used with 'quickCam' on iOS - TODO: still needed?
   */
  self.beginAppending = function beginAppending() {
    var range;
    range = document.createRange();
    range.selectNodeContents(document.body);
    range.collapse(false);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  function getDocText() {
    var alltext = rep.alltext;
    var len = alltext.length;
    if (len > 0) len--; // final extra newline
    return alltext.substring(0, len);
  }

  self.exportText = function() {
    if (currentCallStack && ! currentCallStack.domClean) {
      self.inCallStackIfNecessary("exportText",
          function() { self.fastIncorp(); });
    }
    return getDocText();
  }

  var visibleHeight = null;
  self.getVisibleHeight = function() { return visibleHeight; };
  self.setVisibleHeight = function(height) {
    visibleHeight = height;
  }


  /***************************************************************************
   * Bootstrap!
   ***************************************************************************/

  // Let's get this party started!
  setup();

  // Legacy backwards-compatibility support for iOS devices that rely on
  // older naming.
  self.ace_beginAppending = self.beginAppending;
  self.ace_doInsertImageBlob = function(file) {
    observer.trigger('insert-image', [file]);
  };
  self.ace_canUndoRedo = self.canUndoRedo;
  self.ace_doUndoRedo = self.doUndoRedo;
  self.ace_performDocumentReplaceSelection =
      self.performDocumentReplaceSelection;
  self.ace_doSetHeadingLevel = self.doSetHeadingLevel;
  self.ace_getBaseAttributedText = self.getBaseAttributedText;
  self.ace_getRep = self.getRep;
  self.ace_scrollSelectionIntoView = self.scrollSelectionIntoView;
  self.ace_setProperty = self.setProperty;
  self.ace_exportText = self.exportText;
  self.ace_setOnOpenLink = self.setOnOpenLink = function(handler) {
    observer.on('open-link', function(customEvent, href, internal) {
      handler(href, internal);
      return false;
    });
  };
  self.ace_setOnAttach = self.onAttach = function(handler) {
    observer.on('attach', function(customEvent, imageBlob, attachmentId) {
      handler(imageBlob, attachmentId);
      return false;
    });
  };
  self.ace_setAttachmentUrl = self.setAttachmentUrl =
      function(attachmentId, url, key) {
        observer.trigger('set-attachment', [attachmentId, url, key]);
      };
  self.ace_doReturnKey = self.doReturnKey = function() {
    observer.trigger('return-key');
  };
  self.ace_doDeleteKey = self.doDeleteKey = function() {
    observer.trigger('delete-key');
  };
}
