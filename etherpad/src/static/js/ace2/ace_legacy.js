ace.legacy = function(editor) {
  function importText(text, undoable, dontProcess) {
    var lines;
    if (dontProcess) {
      if (text.charAt(text.length-1) != "\n") {
        throw new Error("new raw text must end with newline");
      }
      if (/[\r\t\xa0]/.exec(text)) {
        throw new Error("new raw text must not contain CR, tab, or nbsp");
      }
      lines = text.substring(0, text.length-1).split('\n');
    } else {
      lines = map(text.split('\n'), textify);
    }

    var newText = "\n";
    if (lines.length > 0) {
      newText = lines.join('\n')+'\n';
    }

    editor.inCallStackIfNecessary("importText" + (undoable ? "Undoable" : ""),
        function() {
          setDocText(newText);
        });

    var rep = editor.getRep();
    if (dontProcess && rep.alltext != text) {
      throw new Error("mismatch error setting raw text in importText");
    }
  }

  function textify(str) {
    return str.replace(/[\n\r ]/g, ' ').replace(/\xa0/g, ' ').
        replace(/\t/g, '        ');
  }

  function setDocText(text) {
    editor.setDocAText(Changeset.makeAText(text));
  }

  function getDocText() {
    var rep = editor.getRep();
    var alltext = rep.alltext;
    var len = alltext.length;
    if (len > 0) len--; // final extra newline

    return alltext.substring(0, len);
  }

  function exportText() {
    var currentCallStack = editor.getCurrentCallStack();
    if (currentCallStack && ! currentCallStack.domClean) {
      editor.inCallStackIfNecessary("exportText",
          function() { editor.fastIncorp(); });
    }
    return getDocText();
  }

  function checkChangesetLineInformationAgainstRep(changes) {
    return true; // disable for speed
    var opIter = Changeset.opIterator(Changeset.unpack(changes).ops);
    var curOffset = 0;
    var curLine = 0;
    var curCol = 0;
    while (opIter.hasNext()) {
      var o = opIter.next();
      if (o.opcode == '-' || o.opcode == '=') {
        curOffset += o.chars;
        if (o.lines) {
          curLine += o.lines;
          curCol = 0;
        }
        else {
          curCol += o.chars;
        }
      }
      var rep = editor.getRep();
      var calcLine = rep.lines.indexOfOffset(curOffset);
      var calcLineStart = rep.lines.offsetOfIndex(calcLine);
      var calcCol = curOffset - calcLineStart;
      if (calcCol != curCol || calcLine != curLine) {
        return false;
      }
    }
    return true;
  }

  function getRepHTML() {
    var rep = editor.getRep();
    return map(rep.lines.slice(), function (entry) {
      var text = entry.text;
      var content;
      if (text.length == 0) {
        content = '<span style="color: #aaa">--</span>';
      } else {
        content = htmlPrettyEscape(text);
      }
      return '<div><code>' + content + '</div></code>';
    }).join('');
  }

  function moveByWordInLine(lineText, initialIndex, forwardNotBack) {
    var i = initialIndex;
    function nextChar() {
      if (forwardNotBack) return lineText.charAt(i);
      else return lineText.charAt(i - 1);
    }
    function advance() { if (forwardNotBack) i++; else i--; }
    function isDone() {
      if (forwardNotBack) return i >= lineText.length;
      else return i <= 0;
    }

    // On Mac and Linux, move right moves to end of word and move left moves to
    // start;
    // on Windows, always move to start of word.
    // On Windows, Firefox and IE disagree on whether to stop for punctuation
    // (FF says no).
    if (browser.windows && forwardNotBack) {
      while ((!isDone()) && editor.isWordChar(nextChar())) { advance(); }
      while ((!isDone()) && !editor.isWordChar(nextChar())) { advance(); }
    } else {
      while ((!isDone()) && !editor.isWordChar(nextChar())) { advance(); }
      while ((!isDone()) && editor.isWordChar(nextChar())) { advance(); }
    }

    return i;
  }

  function getLineEntryTopBottom(entry, destObj) {
    var dom = entry.lineNode;
    var top = dom.offsetTop;
    var height = dom.offsetHeight;
    var obj = (destObj || {});
    obj.top = top;
    obj.bottom = (top+height);
    return obj;
  }

  // Public methods.  Export as necessary.
  return {

  }
};
