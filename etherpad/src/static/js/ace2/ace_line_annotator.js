/**
 * Maintains and updates the annotations that are to the side of a line.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.ui.lineAnnotator} The public methods to annotate lines.
 */
ace.ui.lineAnnotator = function(editor) {
  var lineNumbersShown = 1;
  var sideDiv = document.getElementById('sidediv');
  var lineIdCache = {};
  var lastRowFixedLineNumbers = 0;
  var innerHTMLCompareDiv = document.createElement("div");
  var root = editor.getRoot();

  // TODO: Why the hell is this wrapped in a table??
  sideDiv.innerHTML =
    '<table border="0" cellpadding="0" cellspacing="0" align="right">'+
    '<tr><td id="sidedivinner"><div>&nbsp;</div></td></tr></table>';
  var sideDivInner = document.getElementById("sidedivinner");

  /**
   * Creates appropriate number of DOM nodes, as needed, to display
   * annotations to the side of a line.
   * @param {HTMLElement} container .
   * @param {number} have Current count of lines we have.
   * @param {number} need The amount of lines we'd like to have total.
   * @param {Function=} contentFunc Optional transform the line in a
   *     meaningful way.
   * @return {number} The number of lines we have total.
   */
  function _ensureNumberOfRows(container, have, need, opt_contentFunc) {
    if (need < 1) need = 1;
    if (need != have) {
      while (have < need) {
        have++;
        var div = document.createElement("DIV");
        div.style.top = '0';
        if (opt_contentFunc) {
          div.appendChild(opt_contentFunc(have));
        }
        container.appendChild(div);
      }
      while (need < have) {
        container.removeChild(container.lastChild);
        have--;
      }
    }
    return have;
  }

  /**
   * Intelligently update an out-of-date line annotation so that we don't
   * lock up the UI.
   * @param {HTMLElement} container .
   * @param {Function} fixUpContentFunc Updates the annotation in an intelligent
   *     fashion.
   * @param {Function} isTimeUp Called from time to time to see if we haven't
   *     run out of time allocated for this process (to not lock up the UI).
   * @param {number} startAtChild The point from which to continue updating.
   * @return {number} The point from which the next call to this function
   *     should pick up from.
   */
  function _fixUpRows(container, fixUpContentFunc, isTimeUp, startAtChild) {
    startAtChild = startAtChild || 0;
    if (editor.getCurrentCallStack() && editor.getCurrentCallStack().domClean) {
      var a = container.childNodes[startAtChild];
      var b = root.childNodes[startAtChild];
      var foundDirty = false;
      if (!lineIdCache[container.id]) {
        lineIdCache[container.id] = [];
      }

      while (a && b) {
        if (foundDirty || lineIdCache[container.id][startAtChild] != b.id) {
          lineIdCache[container.id][startAtChild] = b.id;
          foundDirty = true;

          if (fixUpContentFunc(a, b)) {
            $(a).css('top', $(b).offset().top -
                $(root).offset().top + 2 + 'px');
          }
        }

        a = a.nextSibling;
        b = b.nextSibling;

        if (startAtChild++ % 10 == 0 && startAtChild != 1 && isTimeUp()) {
          return startAtChild;
        }
      }
    }
    return 0;
  }

  /**
   * Updates the line numbers on the page as necessary.
   * @param {Function} isTimeUp Called from time to time to see if we haven't
   *     run out of time allocated for this process (to not lock up the UI).
   */
  function updateLineNumbers(isTimeUp) {
    var rep = editor.getRep();
    lineNumbersShown = _ensureNumberOfRows(sideDivInner,
        lineNumbersShown, rep.lines.length());

    var n = 0;
    var prevWasCode = false;

    function _lineNumUpdater(a, b) {
      if (b.childNodes[0] && hasClass(b.childNodes[0], "list-code1")) {
        if (prevWasCode == false ) {
          if (!a.previousSibling || !a.previousSibling.innerHTML) {
            // reset line numbering
            n = 0;
          } else {
            // Since we don't necessarily update every line in fixUpRows and
            // since we might start our start index might start in the middle
            // of the numbered content we could easily get out of sync.  We
            // check here for any previous row that might exist.  If
            // parseInt() returns a NaN it must be that the row before was the
            // menu row.
            n = parseInt(a.previousSibling.innerHTML, 10) || 1;
          }
        }
        n = n + 1;
        prevWasCode = true;

        // The first menu item will be the dropdown menu to control language.
        // The rest are just the line numbers.
        if (n == 1) {
          var langDropdown = document.createElement("A");
          var lineAndChar = editor.getLineAndCharForPoint({
              node:b, index:0, maxIndex:0});
          langDropdown.innerHTML = editor.getLangForCodeLine(
              lineAndChar[0]) || "txt";
          if (langDropdown.innerHTML == "coffee") {
            langDropdown.innerHTML = "coff";
          } else if (langDropdown.innerHTML == "cpp") {
            langDropdown.innerHTML = "c++";
          }
          addClass(langDropdown, "lang-menu");

          if (a.innerHTML != langDropdown.outerHTML + "<span></span>") {
            var number = document.createElement("SPAN");
            number.innerHTML = "";
            a.innerHTML = '';
            a.appendChild(langDropdown);
            a.appendChild(number);
            $(langDropdown).on('click', function(e) {
              e.preventDefault();
              showLangMenu(e, lineAndChar[0]);
              return false;
            });
          }
          return true;
        } else {
          if (a.innerHTML != String(n)) {
            a.innerHTML = n;
          }
          return true;
        }
      } else {
        // Clears out a line that doesn't need numbering anymore.
        prevWasCode = false;
        if (a.innerHTML != '') {
          a.innerHTML = "";
          return false;
        }
      }
      return false;
    }

    lastRowFixedLineNumbers = _fixUpRows(sideDivInner, _lineNumUpdater,
        isTimeUp, lastRowFixedLineNumbers);
  }

  /**
   * Handles the language menu click event.
   */
  function showLangMenu(event, lineNum) {
    $('#hp-editor-lang .hp-ui-button-menu-wrapper a').
        off('.hp-lang').
        on('click.hp-lang',
        function(event) {
          var lang = $(this).text().replace(/^\s+|\s+$/g, '');
          lang = lang == 'c++' ? 'cpp' : lang;
          editor.inCallStackIfNecessary('set-language', function() {
            var line = lineNum;
            while (editor.getLineListType(line).indexOf("code") > -1) {
              editor.performDocumentApplyAttributesToRange(
                  [line, 0], [line, 1], [['lang', lang]]);
              line = line + 1;
            }
          });

          return false;
        });
    showContextMenu(event, 'lang-menu', $('#hp-editor-lang'));
  }

  /**
   * Forces a fresh redraw of the TOC from the top.
   */
  function invalidateCache() {
    lineIdCache = {};
  }

  return {
    invalidateCache: invalidateCache,
    updateLineNumbers: updateLineNumbers
  };
};
