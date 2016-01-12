/**
 * Manages any lists that are created through the editorn.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.lists} The public methods to hook into the lists manager.
 */
ace.lists = function(editor) {
  var MAX_LIST_LEVEL = 8;
  var root = editor.getRoot();

  /**
   * @param {number} lineNum .
   * @return {string} The list type of the given line, if any.
   */
  function getLineListType(lineNum) {
    var rep = editor.getRep();
    // get "list" attribute of first char of line
    var aline = rep.alines[lineNum];
    if (aline) {
      var opIter = Changeset.opIterator(aline);
      if (opIter.hasNext()) {
        return Changeset.opAttributeValue(opIter.next(), 'list', rep.apool) ||
            '';
      }
    }

    return '';
  }

  /**
   * @param {number} lineNum .
   * @return {boolean} Whether the line has a 'magic', or rich, object.
   */
  function getLineHasMagicObject(lineNum) {
    var rep = editor.getRep();
    // get attributes of first char of line
    var aline = rep.alines[lineNum];
    if (aline) {
      var opIter = Changeset.opIterator(aline);
      if (opIter.hasNext()) {
        var op = opIter.next();
        return (Changeset.opAttributeValue(op, 'table', rep.apool) ||
            Changeset.opAttributeValue(op, 'embed', rep.apool) ||
            Changeset.opAttributeValue(op, 'img', rep.apool)) || false;
        ;
      }
    }

    return '';
  }

  /**
   * @param {number} lineNum .
   * @return {number|string} The current indent level for a given line, if any.
   */
  function getLineListPosition(lineNum) {
    var rep = editor.getRep();
    // get "start" attribute of first char of line
    var aline = rep.alines[lineNum];
    if (aline) {
      var opIter = Changeset.opIterator(aline);
      if (opIter.hasNext()) {
        return Changeset.opAttributeValue(opIter.next(), 'start', rep.apool) ||
            '';
      }
    }
    return '';
  }

  /**
   * Performs an indent/outdent on a given line.
   * @param {boolean} isOut Whether to do outdent, instead of indent.
   * @param {boolean} isReturnUnindent Whether we should do an outdent based on
   *     a return key at the end of a line.
   * @return {boolean} Whether we've found any lists to begin with.
   */
  function doIndentOutdent(isOut, isReturnUnindent) {
    var rep = editor.getRep();
    if (! (rep.selStart && rep.selEnd)) {
      return false;
    }

    var firstLine, lastLine;
    firstLine = rep.selStart[0];
    lastLine = Math.max(firstLine,
        rep.selEnd[0] - ((rep.selEnd[1] == 0) ? 1 : 0));

    var mods = [];
    var foundLists = false;
    for (var n = firstLine; n <= lastLine; n++) {
      var listType = getLineListType(n);
      if (listType) {
        listType = /([a-z]+)([12345678])/.exec(listType);
        if (listType) {
          foundLists = true;
          var t = listType[1];
          var level = Number(listType[2]);
          if ((t == "indent" || isReturnUnindent) && level == 1 && isOut) {
            mods.push([n, null]);
          } else {
            var newLevel = Math.max(1, Math.min(MAX_LIST_LEVEL,
                level + (isOut ? -1 : 1)));
            if (level != newLevel) {
              mods.push([n, t + newLevel]);
            }
          }
        }
      } else if (!isOut) {
        mods.push([n, "indent1"]);
        foundLists = true;
      }
    }

    if (mods.length > 0) {
      setLineListTypes(mods);
    }

    return foundLists;
  }

  /**
   * Renumbers a lists section, as needed.
   * @param {number} lineNum .
   * @param {boolean} conservative When true, we stop at step 1.5 below.
   */
  function renumberList(lineNum, conservative) {
    var rep = editor.getRep();

    // 1-check we are in a list
    var type = getLineListType(lineNum);
    if (!type) {
      return null;
    }

    type = /([a-z]+)[12345678]/.exec(type);
    if (!type || type[1] != "number") {
      return null;
    }

    // 1.5-if we were asked to be conservative, we stop if this line has any\
    // number already
    if (conservative) {
      var currentPosition = getLineListPosition(lineNum);
      if (currentPosition) {
        return;
      }
    }

    // 2-find the first line of the list
    while (lineNum - 1 >= 0 && (type = getLineListType(lineNum - 1))) {
      type = /([a-z]+)([12345678])/.exec(type);
      curLevel = Number(type[2]);
      if (!type) {
        break;
      }

      lineNum--;
    }

    // 3-renumber every list item of the same level from the beginning, level 1
    // IMPORTANT: never skip a level because there imbrication may be arbitrary
    var builder = Changeset.builder(rep.lines.totalWidth());
    loc = [0, 0];

    function applyNumberList(line, level) {
      // init
      var position = 1;
      var curLevel = level;
      var listType;
      // loop over the lines
      while (listType = getLineListType(line)) {
        // apply new num
        listType = /([a-z]+)([12345678])/.exec(listType);
        curLevel = Number(listType[2]);
        if (isNaN(curLevel)) {
          return line;
        } else if (listType[1] != "number") {
          line++;
        } else if (curLevel == level) {
          var currentPosition = getLineListPosition(line);
          editor.buildKeepRange(builder, loc, (loc = [line, 0]));
          if (currentPosition != position) {
            editor.buildKeepRange(builder, loc, (loc = [line, 1]),
                [['start', position]], rep.apool);
          } else {
            editor.buildKeepRange(builder, loc, (loc = [line, 1]));
          }

          position++;
          line++;
        } else if (curLevel < level) {
          return line;  // back to parent
        } else {
          line = applyNumberList(line, level + 1);  // recursive call
        }
      }

      return line;
    }

    // 4-apply the modifications
    applyNumberList(lineNum, 1);
    var cs = builder.toString();
    if (!Changeset.isIdentity(cs)) {
      editor.performDocumentApplyChangeset(cs);
    }
  }

  /**
   * Sets the type of a list.
   * @param {number} lineNum .
   * @param {string} listType .
   */
  function setLineListType(lineNum, listType) {
    setLineListTypes([[lineNum, listType]]);
  }

  /**
   * Sets a bulk set of lines to a list type.
   * TODO: Ugh, horrible data type here - who came up with this??
   * @param {Array.<number|string>} Alternating pairs of numbers and types.
   */
  function setLineListTypes(lineNumTypePairsInOrder) {
    var rep = editor.getRep();
    var loc = [0, 0];
    var builder = Changeset.builder(rep.lines.totalWidth());

    for (var i = 0; i < lineNumTypePairsInOrder.length; i++) {
      var pair = lineNumTypePairsInOrder[i];
      var lineNum = pair[0];
      var listType = pair[1];
      editor.buildKeepRange(builder, loc, (loc = [lineNum,0]));

      if (getLineHasMagicObject(lineNum)) {
        // skip lines with magic objcts
      } else if (getLineListType(lineNum)) {
        // already a line marker
        var removeListAndIndent = listType && listType.indexOf('indent') == 0 &&
            getLineListType(lineNum).indexOf('indent') == -1;
        if (listType && !removeListAndIndent) {
          // make different list type
          editor.buildKeepRange(builder, loc, (loc = [lineNum,1]),
              [['list', listType]], rep.apool);
        } else {
          // remove list marker
          editor.buildRemoveRange(builder, loc, (loc = [lineNum,1]));
        }
      } else {
        // currently no line marker
        if (listType) {
          // add a line marker
          builder.insert('*', [['author', editor.getThisAuthor()],
              ['insertorder', 'first'],
              ['list', listType]], rep.apool);
        }
      }
    }

    var cs = builder.toString();
    if (!Changeset.isIdentity(cs)) {
      editor.performDocumentApplyChangeset(cs);
    }

    //if the list has been removed, it is necessary to renumber
    //starting from the *next* line because the list may have been
    //separated. If it returns null, it means that the list was not cut, try
    //from the current one.
    if (renumberList(lineNum + 1) == null) {
      renumberList(lineNum);
    }
  }

  /**
   * Creates a unordered list.
   */
  function doInsertUnorderedList() {
    doInsertList('bullet');
  }

  /**
   * Creates an ordered list.
   */
  function doInsertOrderedList() {
    doInsertList('number');
  }

  /**
   * Creates a code list.
   */
  function doInsertCodeList() {
    doInsertList('code');
  }

  /**
   * Creates a comment list.
   */
  function doInsertComment() {
    doInsertList('comment');
  }

  /**
   * Inserts a list of the appropriate type.
   * @param {string} type .
   */
  function doInsertList(type) {
    var rep = editor.getRep();
    if (!(rep.selStart && rep.selEnd)) {
      return;
    }

    var firstLine, lastLine;
    firstLine = rep.selStart[0];
    lastLine = Math.max(firstLine, rep.selEnd[0] - ((rep.selEnd[1] <=
        rep.lines.atIndex(rep.selEnd[0]).lineMarker) ? 1 : 0));

    var allLinesAreList = true;
    for (var n = firstLine; n <= lastLine; n++) {
      if (getLineListType(n).indexOf(type) < 0) {
        allLinesAreList = false;
        break;
      }
    }

    var mods = [];
    for (var n = firstLine; n <= lastLine; n++) {
      var t = getLineListType(n);
      var level = 1;
      var listType = /[a-z]+([12345678])/.exec(t);
      if (listType) {
        level = Number(listType[1]);
      }

      mods.push([n, allLinesAreList ? 'indent' + level : type + level]);
    }

    setLineListTypes(mods);
  }

  /**
   * Creates a task list.
   */
  function doInsertTaskList() {
    var rep = editor.getRep();
    if (!(rep.selStart && rep.selEnd)) {
      return;
    }

    var firstLine, lastLine;
    firstLine = rep.selStart[0];
    lastLine = Math.max(firstLine,
        rep.selEnd[0] - ((rep.selEnd[1] <=
            rep.lines.atIndex(rep.selEnd[0]).lineMarker) ? 1 : 0));

    var allLinesAreList = true;
    for (var n = firstLine; n <= lastLine; n++) {
      if (getLineListType(n).indexOf("task") < 0) {
        allLinesAreList = false;
        break;
      }
    }

    var mods = [];
    for (var n = firstLine; n <= lastLine; n++) {
      // skip if empty
      if (rep.lines.atIndex(n).text.length == 0 && lastLine > firstLine) {
        continue;
      }

      var t = 'task';
      var level = 1;
      var listType = /([a-z]+)([12345678])/.exec(getLineListType(n));
      if (listType) {
        t = listType[1].indexOf("task") > -1 ? listType[1] : t;
        level = Number(listType[2]);
      }
      mods.push([n, allLinesAreList ? 'indent' + level : t + level]);
    }

    setLineListTypes(mods);
  }

  /**
   * @return {string} A link fragment to a section of a document.
   */
  function locationFragmentForHeading(headingLine) {
    return "#:h=" + headingLine.substring(0, 30).replace(/ /g, "-");
  }

  /**
   * Sets a heading level on a particular line.
   * @param {number} headingLevel .
   */
  function doSetHeadingLevel(headingLevel) {
    editor.inCallStackIfNecessary("headingChange", function() {
      var theLine = editor.caretLine();
      var t = getLineListType(theLine);
      var level = 1;
      var listType = /[a-z]+([12345678])/.exec(t);
      if (listType) {
        level = Number(listType[1]);
      }

      var newListType = {'1': 'hone', '2': 'htwo', '3' :'hthree',
          '0':'indent'}[headingLevel];
      if (newListType == "indent") {
        setLineListType(theLine, "");
      } else {
        setLineListType(theLine, newListType + level);
      }

      if (headingLevel == 0) {
        // turn off bold when returning to normal
        editor.setAttributeOnLine(theLine, "bold", false);
      } else if (headingLevel == 2) {
        // h2 is special - simulated using bold for now
        editor.setAttributeOnLine(theLine, "bold", true);
      }

      editor.getObserver().trigger('track',
          ['heading-menu-action', 'change-heading', headingLevel]);
    });
  }

  /**
   * Displays a heading menu to the user so that they may change the type.
   * @param {Event} event .
   */
  function showHeadingsMenu(event) {
    if (clientVars.isMobile) {
      return;
    }

    function hideHeadingsButton() {
      $('#hp-editor-headings').hide();
      root.focus();
    }

    $('#hp-editor-headings').off('.hp-headings').
        on('menu-closed.hp-headings', function() {
          $('#hp-editor-headings').hide();
        });

    $('#hp-editor-headings-1').off('.hp-headings').
        on('click.hp-headings', function() {
          doSetHeadingLevel(1);
          hideHeadingsButton();
          return false;
        });
    $('#hp-editor-headings-2').off('.hp-headings').
        on('click.hp-headings', function() {
          doSetHeadingLevel(2);
          hideHeadingsButton();
          return false;
        });
    $('#hp-editor-headings-3').off('.hp-headings').
        on('click.hp-headings', function() {
          doSetHeadingLevel(3);
          hideHeadingsButton();
          return false;
        });
    $('#hp-editor-headings-normal').off('.hp-headings').
        on('click.hp-headings', function() {
          doSetHeadingLevel(0);
          hideHeadingsButton();
          return false;
        });
    $('#hp-editor-headings-link').off('.hp-headings').
        on('click.hp-headings', function() {
          var rep = editor.getRep();
          var lineEntry = rep.lines.atIndex(editor.caretLine());
          var text = _trim(lineEntry.text.substring(lineEntry.lineMarker));
          var lineHash = _hashCode(text);
          var locationWithoutFragment = window.top.location.href.split("#")[0];

          editor.getObserver().trigger('track',
              ['heading-menu-action', 'get link']);

          prompt("Copy this link to your clipboard",
              locationWithoutFragment + locationFragmentForHeading(text));
          hideHeadingsButton();
          return false;
        });

    showContextMenu(event, 'headings-menu', $('#hp-editor-headings'));
  }

  // Public methods.
  return {
    doInsertCodeList: doInsertCodeList,
    doInsertComment: doInsertComment,
    doInsertOrderedList: doInsertOrderedList,
    doIndentOutdent: doIndentOutdent,
    doInsertTaskList: doInsertTaskList,
    doInsertUnorderedList: doInsertUnorderedList,
    doSetHeadingLevel: doSetHeadingLevel,
    getLineHasMagicObject: getLineHasMagicObject,
    getLineListType: getLineListType,
    locationFragmentForHeading: locationFragmentForHeading,
    renumberList: renumberList,
    setLineListType: setLineListType,
    showHeadingsMenu: showHeadingsMenu
  }
};
