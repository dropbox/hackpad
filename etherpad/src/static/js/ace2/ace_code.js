/**
 * Manages the editor's code highlighting.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.code} The public methods to hook into code highlighting.
 */
ace.code = function(editor) {
  var root = editor.getRoot();
  var tokActionsQueue = [];
  var tokRequestSuccessful = false;
  var tokRequested = false;
  var tokenizer = {};
  var tokenizerTimeout = null;

  /**
   * Fetches the LaTeX rendering.
   * @param {string} formula The text to render.
   * @param {function(string)} callback .
   */
  function onMath(formula, callback) {
    $.post("/ep/api/latex", { formula: formula }, function(data) {
      if (data.length) {
        // Parse server response
        //               (status)\r\n(url)  (align)                      (errormsg)
        var pattern = /^([-]?\d+)\r\n(\S+)\s([-]?\d+)\s(\d+)\s(\d+)\r?\n?([\s\S]*)/;

        var regs = data.match(pattern);
        var status = regs[1];
        var imgurl = regs[2];
        var valign = regs[3];
        var imgw   = regs[4];
        var imgh   = regs[5];
        var errmsg = regs[6];

        if (status == '0') {
          callback('<img class="" src="' + imgurl + '">');
        } else {
          callback("<pre>" + errmsg + "</pre>");
        }
      }
    }).error(function() { callback(); });
  }

  /**
   * Retrieves a tokenizer script for the language.
   * @param {string} lang .
   * @return {Function} The tokenizer to apply to the text.
   */
  function getTokenizer(lang) {
    // pick the right tokenizer (potentially requesting one)
    var tok = tokenizer['default'];
    if (lang) {
      if (!tokenizer[lang]) {
        requestTokenizer(lang);
      } else {
        tok = tokenizer[lang];
      }
    }

    return tok;
  }

  /**
   * Performs a request to grab a tokenizer from the server.
   * @param {string} lang .
   */
  function requestTokenizer(lang) {
    var requestAction = function() {
      require(["helper"], function(helper) {
        editor.setProperty("langtokenizer", [helper("foo." + lang), lang]);
      });
    };

    if (!tokRequested) {
      $.ajax({
        url: "/static/js/tok/require_all.js",
        dataType: "script",
        cache: true,
        success: function() {
          tokRequestSuccessful = true;
          requestAction();

          if (tokActionsQueue.length) {
            for (var x = 0; x < tokActionsQueue.length; ++x) {
              tokActionsQueue[x]();
            }
            tokActionsQueue = [];
          }
        }
      });
      tokRequested = true;
    } else {
      if (tokRequestSuccessful) {
        requestAction();
      } else {
        tokActionsQueue.push(requestAction);
      }
    }
  }

  /**
   * @return {boolean} Whether the editor is in full code mode or not.
   */
  function isMonospace() {
    return editor.getTextFace() == "monospace";
  }

  /**
   * Sets a tokenizer function for a language.
   * @param {Function} t The tokenizer function to apply to a text.
   * @param {string=} opt_lang The language it applies to.
   */
  function setTokenizer(t, opt_lang) {
    // If tokenizer is enabled, disable spell checking.
    // Browser sniffing, mmmm, delicious.
    if (userAgentInfo() == 'Firefox') {
      $(root).attr('spellcheck', 'false');
    }

    tokenizer[opt_lang || 'default'] = t;
    window.clearTimeout(tokenizerTimeout);
    tokenizerTimeout = window.setTimeout(function() {
      editor.inCallStackIfNecessary("setTokenizer", function() {
        editor.fastIncorp();
        var rep = editor.getRep();
        recolorLinesInRange(0, rep.alltext.length);
      });
    }, 0);
  }

  /**
   * @param {number} lineNum .
   * @return {string} The language for the line, if any.
   */
  function getLangForCodeLine(lineNum) {
    var rep = editor.getRep();
    var aline = rep.alines[lineNum];
    if (aline) {
      var opIter = Changeset.opIterator(aline);
      if (opIter.hasNext()) {
        lang = Changeset.opAttributeValue(opIter.next(), 'lang', rep.apool) ||
            '';

        // There was a bug https://github.com/hackpad/pad/issues/1317
        // that had saved 'c++' instead of 'cpp', we compensate for that here.
        lang = lang == 'c++' ? 'cpp' : lang;
        return lang;
      }
    }

    return '';
  }

  /**
   * Recolors the lines in a particular range.
   * @param {number} startChar .
   * @param {number} endChar .
   * @param {Function} isTimeUp TODO: seems unused.
   * @param {Function=} optModFunc TODO: also seems unused.
   */
  function recolorLinesInRange(startChar, endChar, isTimeUp, optModFunc) {
    var rep = editor.getRep();

    if (endChar <= startChar) return;
    if (startChar < 0 || startChar >= rep.lines.totalWidth()) return;
    // rounds down to line boundary
    var lineEntry = rep.lines.atOffset(startChar);
    var lineStart = rep.lines.offsetOfEntry(lineEntry);
    var lineIndex = rep.lines.indexOfEntry(lineEntry);
    var selectionNeedsResetting = false;
    var firstLine = null;
    var lastLine = null;
    isTimeUp = (isTimeUp || noop);

    // tokenFunc function; accesses current value of lineEntry and curDocChar,
    // also mutates curDocChar
    var curDocChar;
    var tokenFunc = function(tokenText, tokenClass) {
      lineEntry.domInfo.appendSpan(tokenText, tokenClass);
    };
    if (optModFunc) {
      var f = tokenFunc;
      tokenFunc = function(tokenText, tokenClass) {
        optModFunc(tokenText, tokenClass, f, curDocChar);
        curDocChar += tokenText.length;
      };
    }

    while (lineEntry && lineStart < endChar && ! isTimeUp()) {
      var lineEnd = lineStart + lineEntry.width;

      curDocChar = lineStart;
      lineEntry.domInfo.clearSpans();
      editor.getSpansForLine(lineEntry, tokenFunc, lineStart);
      lineEntry.domInfo.finishUpdate();

      editor.markNodeClean(lineEntry.lineNode);

      if (rep.selStart && rep.selStart[0] == lineIndex ||
          rep.selEnd && rep.selEnd[0] == lineIndex) {
        selectionNeedsResetting = true;
      }

      //if (timer()) console.dirxml(lineEntry.lineNode.dom);

      if (firstLine === null) firstLine = lineIndex;
      lastLine = lineIndex;
      lineStart = lineEnd;
      lineEntry = rep.lines.next(lineEntry);
      lineIndex++;
    }

    if (selectionNeedsResetting) {
      editor.getCurrentCallStack().selectionAffected = true;
    }
    //console.log("Recolored line range %d-%d", firstLine, lastLine);
  }

  // Public methods.
  return {
    getLangForCodeLine: getLangForCodeLine,
    getTokenizer: getTokenizer,
    isMonospace: isMonospace,
    onMath: onMath,
    setTokenizer: setTokenizer
  };
};
