/**
 * Manages the editor's selection.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.selection} The public methods to hook into the selection
 *     manager.
 */
ace.selection = function(editor) {
  var ZEROWIDTH_SPACE = "\u200b";
  var previousRep = { selStart: [], selEnd: [] };
  var savedSelection = null;
  var root = editor.getRoot();

  /**
   * @return {Object=} Returns null, or a structure containing startPoint and
   * endPoint, each of which has node (a magicdom node), index, and maxIndex.
   * If the node is a text node, maxIndex is the length of the text;
   * else maxIndex is 1.  Index is between 0 and maxIndex, inclusive.
   */
  function getSelection() {
    var browserSelection = window.getSelection();

    if (browserSelection && browserSelection.type != "None" &&
        browserSelection.rangeCount !== 0) {
      var range = browserSelection.getRangeAt(0);

      function isInBody(n) {
        while (n && !(n.tagName && n.tagName.toLowerCase() == "body")) {
          n = n.parentNode;
        }
        return !!n;
      }

      function pointFromRangeBound(container, offset) {
        if (!isInBody(container)) {
          // command-click in Firefox selects whole document, HEAD and BODY!
          return { node: root, index: 0, maxIndex: 1 };
        }

        var n = container;
        var childCount = n.childNodes.length;
        if (isNodeText(n) || n.getAttribute("faketext")) {
          return { node: n, index: offset, maxIndex:
              (n.nodeValue || n.getAttribute("faketext")).length };
        } else if (childCount == 0) {
          return { node: n, index: 0, maxIndex: 1 };
        } else if (offset == childCount) {
          // treat point between two nodes as BEFORE the second
          // (rather than after the first) if possible; this way point at end
          // of a line block-element is treated as at beginning of next line
          var nd = n.childNodes.item(childCount - 1);
          var max = nodeMaxIndex(nd);
          return { node: nd, index: max, maxIndex: max };
        } else {
          var nd = n.childNodes.item(offset);
          var max = nodeMaxIndex(nd);
          return { node: nd, index: 0, maxIndex: max };
        }
      }

      var selection = {};
      // Check that the range is within the root of our editor.
      if (!hasParent(range.startContainer, root) ||
          !hasParent(range.endContainer, root)) {
        return null;
      }

      selection.startPoint = pointFromRangeBound(range.startContainer,
          range.startOffset);
      selection.endPoint = pointFromRangeBound(range.endContainer,
          range.endOffset);
      selection.focusAtStart = (((range.startContainer != range.endContainer) ||
          (range.startOffset != range.endOffset)) &&
          browserSelection.anchorNode &&
          (browserSelection.anchorNode == range.endContainer) &&
          (browserSelection.anchorOffset == range.endOffset));

      // Save the current selection in case we blur out of the editor and come
      // back to it later.
      savedSelection = selection;
      return selection;
    } else {
      return null;
    }
  }

  /**
   * Sets the editor selection.
   * @param {Object} selection .
   */
  function setSelection(selection) {
    function copyPoint(pt) {
      return { node: pt.node, index: pt.index, maxIndex: pt.maxIndex };
    }

    var isCollapsed;
    function pointToRangeBound(pt) {
      var p = copyPoint(pt);
      // Make sure Firefox cursor is deep enough; fixes cursor jumping when at
      // top level, and also problem where cut/copy of a whole line selected
      // with fake arrow-keys copies the next line too.
      if (isCollapsed) {
        function diveDeep() {
          while (p.node.childNodes.length > 0) {
            if (p.index == 0) {
              p.node = p.node.firstChild;
              p.maxIndex = nodeMaxIndex(p.node);
            } else if (p.index == p.maxIndex) {
              p.node = p.node.lastChild;
              p.maxIndex = nodeMaxIndex(p.node);
              p.index = p.maxIndex;
            } else {
              break;
            }
          }
        }

        // Now fix problem where cursor at end of text node at end of span-like
        // element with background doesn't seem to show up...
        if (isNodeText(p.node) && p.index == p.maxIndex) {
          var n = p.node;
          while ((!n.nextSibling) && (n != root) && (n.parentNode != root)
              && n.parentNode != null) {
            n = n.parentNode;
          }

          if (n.nextSibling &&
              (!((typeof n.nextSibling.tagName) == "string" &&
                  n.nextSibling.tagName.toLowerCase() == "br")) &&
              (n != p.node) && (n != root) && (n.parentNode != root)) {
            // found a parent, go to next node and dive in
            p.node = n.nextSibling;
            p.maxIndex = nodeMaxIndex(p.node);
            p.index = 0;
            diveDeep();
          }
        }

        // Try to make sure insertion point is styled;
        // Also fixes other FF problems.
        if (!isNodeText(p.node)) {
          diveDeep();
        }
      }
      if (isNodeText(p.node)) {
        return { container: p.node, offset: p.index };
      } else {
        // p.index in {0,1}
        return { container: p.node.parentNode,
            offset: childIndex(p.node) + p.index };
      }
    }

    var browserSelection = window.getSelection();
    if (browserSelection && selection) {
      isCollapsed = (selection.startPoint.node === selection.endPoint.node &&
          selection.startPoint.index === selection.endPoint.index);
      var start = pointToRangeBound(selection.startPoint);
      var end = pointToRangeBound(selection.endPoint);

      if ((!isCollapsed) && selection.focusAtStart &&
          browserSelection.collapse && browserSelection.extend) {
        browserSelection.removeAllRanges();
        // can handle "backwards"-oriented selection, shift-arrow-keys
        // move start of selection
        browserSelection.collapse(end.container, end.offset);
        //console.trace();
        //console.log(htmlPrettyEscape(rep.alltext));
        //console.log("%o %o", rep.selStart, rep.selEnd);
        //console.log("%o %d", start.container, start.offset);
        browserSelection.extend(start.container, start.offset);
      } else {
        if (selection && browserSelection.rangeCount &&
          browserSelection.getRangeAt(0).startContainer === start.container &&
          browserSelection.getRangeAt(0).endContainer === end.container &&
          browserSelection.getRangeAt(0).startOffset === start.offset &&
          browserSelection.getRangeAt(0).endOffset === end.offset) {
          return;
        }

        if (start.container && hasClass(start.container.parentNode,
            'emoji-glyph')) {
          // Don't mess with emoji, yo.
          // TODO: this could be expanded in the future to encompass
          // all -webkit-user-modify: read-only properties.
          start.container = start.container.parentNode.parentNode;
          end.container = end.container.parentNode.parentNode;
        }

        var range = document.createRange();
        try {
          range.setStart(start.container, start.offset);
        } catch(ex) {
          // XXX: This is some emoji hackery.
          start.offset = 1;
          end.offset = 1;
          range.setStart(start.container, start.offset);
        }

        range.setEnd(end.container, end.offset);
        browserSelection.removeAllRanges();
        browserSelection.addRange(range);
      }
    }
  }

  /**
   * We try to restore the previous selection, best effort.
   * The node might not exist anymore for the savedSelection (e.g. when
   * dropping images in we put a placeholder div that disappears) so we only
   * use the savedSelection if the node is valid, otherwise we use the rep.
   */
  function restoreSelection() {
    var rep = editor.getRep();
    var savedSelectionNode = savedSelection && savedSelection.startPoint ?
        savedSelection.startPoint.node : null;
    if (savedSelectionNode && testNodeExists(savedSelectionNode)) {
      savedSelection && setSelection(savedSelection);
    } else if (rep.selStart) {
      // We get here if the node is missing from the saved selection.
      if (editor.getLineHasMagicObject(rep.selStart[0])) {
        // Increment up by one line if it's a 'magic object' we're dropping in.
        if (rep.selStart[0] < rep.lines.length() - 1) {
          rep.selStart[0] = rep.selStart[0] + 1;
          rep.selEnd[0] = rep.selStart[0];
        }
      } else {
        // Increment by one character if it's something inline we've added,
        // like a link to another pad.
        rep.selStart[1] = rep.selStart[1] + 1;
        rep.selEnd[1] = rep.selStart[1];
      }

      // Make sure rep is within current limits, in case someone else has edited
      // the pad in the meantime from underneath you.
      if (rep.selStart[0] >= rep.lines.length()) {
        rep.selStart[0] = rep.lines.length() - 1;
        rep.selEnd[0] = rep.selStart[0];
      }

      updateBrowserSelectionFromRep();
    }
  }

  /**
   * Sets the selection based on the editor rep.
   */
  function updateBrowserSelectionFromRep() {
    var rep = editor.getRep();
    // requires normalized DOM!
    var selStart = rep.selStart, selEnd = rep.selEnd;

    if (!(selStart && selEnd)) {
      setSelection(null);
      return;
    }


    // Don't update selection if editor isn't focused.
    if (root.ownerDocument.activeElement != root) {
      return;
    }

    var selection = {};
    var ss = [selStart[0], selStart[1]];
    selection.startPoint = getPointForLineAndChar(ss);
    var se = [selEnd[0], selEnd[1]];
    selection.endPoint = getPointForLineAndChar(se);
    selection.focusAtStart = !!rep.selFocusAtStart;
    setSelection(selection);
    editor.getObserver().trigger('caret');
  }

  /**
   * @return {number} Gets the x-coordinate of the start of a selection.
   */
  function getSelectionPointX(point) {
    // doesn't work in wrap-mode
    var node = point.node;
    var index = point.index;
    function leftOf(n) { return n.offsetLeft; }
    function rightOf(n) { return n.offsetLeft + n.offsetWidth; }

    if (!isNodeText(node)) {
      if (index == 0) {
        return leftOf(node);
      } else {
        return rightOf(node);
      }
    } else {
      // we can get bounds of element nodes, so look for those.
      // allow consecutive text nodes for robustness.
      var charsToLeft = index;
      var charsToRight = node.nodeValue.length - index;
      var n;

      for (n = node.previousSibling; n && isNodeText(n);
          n = n.previousSibling) {
        charsToLeft += n.nodeValue;
      }

      var leftEdge = (n ? rightOf(n) : leftOf(node.parentNode));
      for (n = node.nextSibling; n && isNodeText(n); n = n.nextSibling) {
        charsToRight += n.nodeValue;
      }

      var rightEdge = (n ? leftOf(n) : rightOf(node.parentNode));
      var frac = (charsToLeft / (charsToLeft + charsToRight));
      var pixLoc = leftEdge + frac * (rightEdge - leftEdge);

      return Math.round(pixLoc);
    }
  }

  /**
   * Bring the node into view by scrolling to its position.
   * @param {Element} node .
   * @param {boolean=} opt_center Whether to center the node in the center of
   *     the screen.
   */
  function scrollNodeVerticallyIntoView(node, opt_center) {
    // requires element (non-text) node;
    // if node extends above top of viewport or below bottom of viewport
    // (or top of scrollbar), scroll it the minimum distance needed to be
    // completely in view.
    var offset = node.offsetTop + 50;
    if (opt_center) {
      var viewportHeight = (window.screen && window.screen.availHeight) || 200;
      offset += viewportHeight / 2;
    }

    var height = editor.getVisibleHeight();
    if (!height) {
      height = $(window).height();
      if (padutils.getIsMobile()) {
        /* Try to stay above the on-screen keyboard. This value could be
         * different depending on orientation, but 2 seems to work OK for both
         * on iOS.
         */
        height /= 2;
      }
    }
    if (offset < $("#padeditor").offset().top) {
      $("html, body").animate({ scrollTop: 0 }, 100);
    } else if (offset > $(window).scrollTop() + height) {
      $("html, body").animate({ scrollTop: offset - height }, 100);
    } else if (offset < $(window).scrollTop()) {
      $("html, body").animate({ scrollTop: offset - 13 }, 100);
    }
  }

  /**
   * Bring the selection into the browser view.
   */
  function scrollSelectionIntoView() {
    var rep = editor.getRep();
    if (!rep.selStart) return;

    var focusLine = (rep.selFocusAtStart ? rep.selStart[0] : rep.selEnd[0]);
    scrollNodeVerticallyIntoView(rep.lines.atIndex(focusLine).lineNode);
  }

  /**
   * @return {boolean} Whether the node is in the DOM currently or not.
   */
  function testNodeExists(n) {
    if (browser.msie) {
      return root.contains(n) && n.constructor != window.HTMLUnknownElement;
    } else {
      return root.contains(n);
    }
  }

  /**
   * @return {Array.<number, number>} The line and column of the a given node.
   */
  function getLineAndCharForPoint(point) {
    var rep = editor.getRep();

    // Turn DOM node selection into [line,char] selection.
    // This method has to work when the DOM is not pristine,
    // assuming the point is not in a dirty node.
    if (point.node == root) {
      if (point.index == 0) {
        return [0, 0];
      } else {
        var N = rep.lines.length();
        var ln = rep.lines.atIndex(N - 1);
        return [N - 1, ln.text.length];
      }
    } else {
      var n = point.node;
      var col = 0;

      // if this part fails, it probably means the selection node
      // was dirty, and we didn't see it when collecting dirty nodes.
      if (isNodeText(n)) {
        col = point.index;
        if (nodeText(n)[0] == ZEROWIDTH_SPACE) {
          col = Math.max(col - 1, 0);
        }
      } else if (point.index > 0) {
        col = nodeText(n).length;
      }

      var parNode, prevSib;
      while ((parNode = n.parentNode) != root) {
        if ((prevSib = n.previousSibling)) {
          n = prevSib;
          col += nodeText(n).length;
          if (nodeText(n)[0] == ZEROWIDTH_SPACE) {
            col = Math.max(col - 1, 0);
          }
        } else {
          n = parNode;
        }
      }

      if (n.id == "") console.log("BAD");
      if (n.firstChild && isBlockElement(n.firstChild)) {
        col += 1; // lineMarker
      }
      var lineEntry = rep.lines.atKey(n.id);
      var lineNum = rep.lines.indexOfEntry(lineEntry);
      return [lineNum, col];
    }
  }

  /**
   * @return {Object} The node object and indices based on the line and column.
   */
  function getPointForLineAndChar(lineAndChar) {
    var rep = editor.getRep();
    var line = lineAndChar[0];
    var charsLeft = lineAndChar[1];
    //console.log("line: %d, key: %s, node: %o", line,
    //    rep.lines.atIndex(line).key,
    //    getCleanNodeByKey(rep.lines.atIndex(line).key));
    var lineEntry = rep.lines.atIndex(line);
    charsLeft -= lineEntry.lineMarker;

    if (charsLeft < 0) {
      charsLeft = 0;
    }

    var lineNode = lineEntry.lineNode;
    var n = lineNode;
    var after = false;

    if (charsLeft == 0) {
      var index = 0;
      if (browser.msie && line == (rep.lines.length() - 1) &&
          lineNode.childNodes.length == 0) {
        // best to stay at end of last empty div in IE
        index = 1;
      }

      if (browser.msie && lineNode.childNodes.length == 0) {
        // also stay at ends of all empty divs
        index = 1;
      }

      return { node: lineNode, index: index, maxIndex: 1 };
    }

    while (!(n == lineNode && after)) {
      if (after) {
        if (n.nextSibling) {
          n = n.nextSibling;
          after = false;
        } else {
          n = n.parentNode;
        }
      } else {
        if (isNodeText(n) || n.getAttribute("faketext")) {
          var len = (n.nodeValue || n.getAttribute("faketext")).length;

          if (n.nodeValue && n.nodeValue[0] == ZEROWIDTH_SPACE) {
            charsLeft += 1;
          }

          // do not stop if the next node starts with a ZEROWIDTH_SPACE
          var stopHere = (charsLeft <= len);
          if (charsLeft == len) {
            var nextTextNode = n.parentNode.nextSibling &&
                n.parentNode.nextSibling.firstChild;
            if (nextTextNode && isNodeText(nextTextNode) &&
                nextTextNode.nodeValue[0] == ZEROWIDTH_SPACE) {
              stopHere = false;
            }
          }

          if (stopHere) {
            return { node: n, index: charsLeft, maxIndex: len };
          }

          charsLeft -= len;
          after = true;
        } else {
          if (n.firstChild) {
            n = n.firstChild;
          } else {
            after = true;
          }
        }
      }
    }

    return { node: lineNode, index: 1, maxIndex: 1 };
  }

  /**
   * Shows/hides the toolbar upon selection.
   * @param {Object} selection .
   * @param {boolean} isCaret Whether the selection is currently collapsed.
   * @param {boolean} isMultiline Whether the selection spans multiple lines.
   */
  function updateToolbarIfNecessary(selection, isCaret, isMultiline) {
    var rep = editor.getRep();
    if (!(rep.selStart && rep.selEnd)) return;

    var toolbarBtn = $('#hp-editor-selection-wrapper');
    if (selection && !isCaret) {
      var rootOffset = $(root).offset();
      if (toolbarBtn.is(':visible') &&
          previousRep.selStart.join(',') == rep.selStart.join(',') &&
          previousRep.selEnd.join(',') == rep.selEnd.join(',')) {
        return;
      }

      toolbarBtn.removeClass('link-mode').
          removeClass('link-hover-mode').
          removeClass('newpad-mode');
      var coords = getSelectionCoords();
      toolbarBtn.css({
        'top': coords.y + (coords.height / 2) + 20 - rootOffset.top +
            $(window).scrollTop(),
        'left': coords.x + (coords.width / 2) - toolbarBtn.width() / 2 -
            rootOffset.left - 4 });
      previousRep = { selStart: rep.selStart.slice(0), selEnd:
          rep.selEnd.slice(0) };

      if (toolbarBtn.is(':visible')) {
        return;
      }

      window.setTimeout(function() {
        toolbarBtn.addClass('hp-editor-selection-shown');
      }, 0);
    } else {
      toolbarBtn.removeClass('hp-editor-selection-shown');
      if ($('body').hasClass('ace-focused')) {
        toolbarBtn.removeClass('link-mode').
            removeClass('newpad-mode');
      }
    }
  }

  /**
   * @return {Object} The bounding box for the current selection.
   */
  function getSelectionCoords() {
    var sel = document.selection, range;
    var x = 0, y = 0;
    var width = 0, height = 0;
    if (sel) {
      if (sel.type != "Control") {
        range = sel.createRange();
        x = range.boundingLeft;
        y = range.boundingTop;
        width = range.boundingWidth;
        height = range.boundingHeight;
      }
    } else if (window.getSelection) {
      sel = window.getSelection();
      if (sel.rangeCount) {
        range = sel.getRangeAt(0).cloneRange();
        if (range.getBoundingClientRect) {
          var rect = range.getBoundingClientRect();
          x = rect.left;
          y = rect.top;
          width = rect.right - rect.left;
          height = rect.bottom - rect.top;
        }
      }
    }
    return { x: x, y: y, width: width, height: height };
  }

  /**
   * @return {Object} The positions of where a selection starts and ends.
   */
  function getNodeSelectionRange(node) {
    var n = { node: node, index: 0, maxIndex: 0 };
    var selectionStart = getLineAndCharForPoint(n);
    var selectionEnd = [selectionStart[0], selectionStart[1] +
        $(node).text().length];
    return { ss: selectionStart, se: selectionEnd };
  }

  /**
   * Creates and manages the selection toolbar, which allows linking and
   * creating new pads from highlighted text.
   */
  function setupSelectionToolbar() {
    var linkHoverTimeout;
    var toolbarBtn = $('#hp-editor-selection-wrapper');

    // Activate tooltips
    padutils.tooltip('#hp-editor-selection-link, #hp-editor-selection-newpad');

    // Hooks up auto-hiding of the selection toolbar.
    toolbarBtn.off('.hp-editor-selection').
        on('click.hp-editor-selection', function() {
      if (!toolbarBtn.hasClass('link-mode') &&
          !toolbarBtn.hasClass('link-hover-mode') &&
          !toolbarBtn.hasClass('newpad-mode')) {
        restoreSelection();
      }
      return false;
    }).on('mouseover.hp-editor-selection', function() {
      window.clearTimeout(linkHoverTimeout);
    }).on('mouseout', function() {
      if (toolbarBtn.hasClass('link-hover-mode')) {
        linkHoverTimeout = window.setTimeout(function() {
          if (!$('#hp-editor-selection-link-url').is(':focus')) {
            toolbarBtn.removeClass('link-hover-mode');
          }
        }, 500);
      }
    });

    // Handler that initiates creation of a link.
    $('#hp-editor-selection-link').
        off('.hp-editor-selection').
        on('click.hp-editor-selection', function(ev) {
          toolbarBtn.addClass('link-mode');
          $("#tooltip").remove();
          $('#hp-editor-selection-link-url').val('');
          setTimeout(function() {
            $('#hp-editor-selection-link-url').focus();
          }, 100);
          editor.getObserver().trigger('track', ['createLinkStart']);
          return false;
        });

    // Finalizes creation of a new link.
    var confirmNewLink = function() {
      var rep = editor.getRep();

      if (toolbarBtn.hasClass('link-hover-mode')) {
        var nodeSelection = getNodeSelectionRange(
            $('#hp-editor-selection-link-url').data('link-hover-target'));
        editor.inCallStack("linkHover", function() {
          editor.performSelectionChange(nodeSelection.ss, nodeSelection.se);
        });
      }

      var url = $('#hp-editor-selection-link-url').val();
      if (!url) {
        return false;
      }

      if (!padutils.isWhitelistUrlScheme(url)) {
        url = window.location.protocol + "//" + url;
      }

      var domain = window.location.protocol + '//' + window.location.host;
      if (url.indexOf(domain) == 0) {
        url = url.substring(domain.length);
        if (url[0] != '/') {
          // Prevent url like https://hackpad.com:9000javascript:alert('xss')
          url = '/' + url;
        }
      }

      var changeset = editor.createChangesetFromRange(rep.selStart, rep.selEnd);
      insertLink(changeset.atext.text.replace("\n", ""), url);
      toolbarBtn.removeClass('link-mode');
      toolbarBtn.removeClass('link-hover-mode');
      editor.getObserver().trigger('track', ['createLinkDone', null, null,
          { url: url }]);
      return false;
    };

    // Create link via the confirm button.
    $('#hp-editor-selection-link-confirm').
        off('.hp-editor-selection').
        on('click.hp-editor-selection', function(ev) {
          confirmNewLink();
        });

    // Create link via the enter key.
    $('#hp-editor-selection-link-url').
        off('.hp-editor-selection').
        on('keydown.hp-editor-selection', function(ev) {
          if (ev.keyCode == 13 /* enter */) {
            confirmNewLink();
          }
        }).
        on('blur.hp-editor-selection', function() {
          window.setTimeout(function() {
            toolbarBtn.removeClass('link-hover-mode');
          }, 100);
        });

    // Unlinks the text.
    $('#hp-editor-selection-link-delete').
        off('.hp-editor-selection').
        on('click.hp-editor-selection', function(ev) {
          var nodeSelection = getNodeSelectionRange(
              $('#hp-editor-selection-link-url').data('link-hover-target'));
          editor.inCallStack("linkHover", function() {
            editor.performDocumentApplyAttributesToRange(nodeSelection.ss,
                nodeSelection.se, [['link', '']]);
          });

          toolbarBtn.removeClass('link-hover-mode');
        });

    // Finalizes creation of a new pad.
    var confirmNewPad = function(title) {
      var title = title || $('#hp-editor-selection-newpad-title').val();
      if (!title) {
        return;
      }

      var rep = editor.getRep();
      editor.getObserver().trigger('track', ['popup-pagecreate']);
      var changeset = editor.createChangesetFromRange(rep.selStart, rep.selEnd);
      editor.getObserver().trigger('create-page', [changeset.atext,
          changeset.apool.toJsonable(), title]);
      toolbarBtn.removeClass('newpad-mode');
    };

    // Initializes creation of a new pad.
    $('#hp-editor-selection-newpad').
        off('.hp-editor-selection').
        on('click.hp-editor-selection', function(ev) {
          toolbarBtn.addClass('newpad-mode');
          $("#tooltip").remove();
          var rep = editor.getRep();
          var changeset = editor.createChangesetFromRange(rep.selStart,
              rep.selEnd);
          var selection = changeset.atext.text;
          var withoutContent = selection.split("\n").length == 1 ||
              (selection.split("\n").length == 2 &&
              selection.split("\n")[1] == "");
          if (withoutContent) {
            //confirmNewPad(selection.replace("\n", ""));
            $('#hp-editor-selection-newpad-title').
                val(selection.replace("\n", ""));
            setTimeout(function() {
              $('#hp-editor-selection-newpad-title').focus();
            }, 100);
          } else {
            $('#hp-editor-selection-newpad-title').val('');
            setTimeout(function() {
              $('#hp-editor-selection-newpad-title').focus();
            }, 100);
          }

          return false;
        });

    // Creates pad via confirm button.
    $('#hp-editor-selection-newpad-confirm').
        off('.hp-editor-selection').
        on('click.hp-editor-selection', function(ev) {
          confirmNewPad();
        });

    // Creates pad via enter key.
    $('#hp-editor-selection-newpad-title').
        off('.hp-editor-selection').
        on('keydown.hp-editor-selection', function(ev) {
          if (ev.keyCode == 13 /* enter */) {
            confirmNewPad();
          }
        });

    var linkHoverStartTimeout;
    // Shows the selection toolbar when hovered over a link.
    $(document).on('mouseover', '.ace-line .attrlink a', function(event) {
      linkHoverStartTimeout = window.setTimeout(function() {
        if ((toolbarBtn.is(':visible') &&
            !toolbarBtn.hasClass('link-hover-mode')) ||
            toolbarBtn.hasClass('link-mode') ||
            toolbarBtn.hasClass('newpad-mode')) {
          return;
        }

        window.clearTimeout(linkHoverTimeout);

        var rootOffset = $(root).offset();
        toolbarBtn.addClass('link-hover-mode');
        toolbarBtn.css({
          'top': $(event.currentTarget).offset().top +
              $(event.currentTarget).height() + 10 - rootOffset.top,
          'left': $(event.currentTarget).offset().left +
              ($(event.currentTarget).width() / 2) -
              toolbarBtn.outerWidth(true) / 2 -
              ((toolbarBtn.outerWidth(true) - toolbarBtn.outerWidth()) / 2) -
              rootOffset.left - 4 });
        var href = $(event.currentTarget).attr('href');
        if (href.charAt(0) == '/') {
          href = window.location.protocol + '//' + window.location.host + href;
        }
        $('#hp-editor-selection-link-url').
            val(href).
            data('link-hover-target', event.currentTarget);

        if (toolbarBtn.is(':visible')) {
          return;
        }

        window.setTimeout(function() {
          toolbarBtn.addClass('hp-editor-selection-shown');
        }, 0);
      }, 500);
    });

    // Hides selection toolbar after a certain time.
    $(document).on('mouseout', '.ace-line .attrlink a', function(event) {
      window.clearTimeout(linkHoverStartTimeout);
      linkHoverTimeout = window.setTimeout(function() {
        if (!$('#hp-editor-selection-link-url').is(':focus')) {
          toolbarBtn.removeClass('link-hover-mode');
        }
      }, 500);
    });
  }

  /**
   * Creates a new link in the editor.
   */
  function insertLink(title, url) {
    var rep = editor.getRep();
    if (!(rep.selStart && rep.selEnd)) return;

    editor.inCallStack("linkinsert", function() {
      editor.fastIncorp();
      var rep = editor.getRep();
      var ss = rep.selStart;
      var se = [ss[0], ss[1] + title.length];
      editor.replaceRange(rep.selStart, rep.selEnd, title);
      editor.performDocumentApplyAttributesToRange(ss, se, [['link', url]]);

      if ($.browser.mozilla) {
        var insertionPoint = [ss[0], ss[1] + title.length];
        editor.replaceRange(insertionPoint, insertionPoint, " ");
      }
    });
  }

  /**
   * Focuses the editor, with an optional line number if desired.
   * @param {number=} The line number to jump to, if any.
   */
  function focus(opt_lineNumber) {
    window.focus(); // for ios, TODO: needed anymore?
    root.focus();

    if (opt_lineNumber) {
      var headingTargetText = null;
      if (opt_lineNumber.split("h=")[1]) {
        headingTargetText = _trim(opt_lineNumber.split("h=")[1]);
      }

      editor.inCallStackIfNecessary('gotoline', function() {
        editor.fastIncorp();
        var rep = editor.getRep();
        var lineOffset = 0;

        for (var lineIndex = 0; lineIndex < rep.lines.length(); lineIndex++) {
          var lineEntry = rep.lines.atIndex(lineIndex);
          var text = _trim(lineEntry.text.substring(lineEntry.lineMarker));

          //console.log(lineIndex + " " + _hashCode(text) + " " + text);
          if (_hashCode(text) === parseInt(opt_lineNumber)) {
            opt_lineNumber = lineIndex + 1;
            //lineOffset = lineEntry.text.length;
            break;
          }

          if (headingTargetText && headingTargetText ==
              text.substring(0, headingTargetText.length).replace(/ /g, '-')) {
            opt_lineNumber = lineIndex + 1;
            break;
          }
        }

        if (opt_lineNumber < rep.lines.length()) {
          editor.performSelectionChange([opt_lineNumber - 1, lineOffset],
              [opt_lineNumber - 1, lineOffset]);
          scrollNodeVerticallyIntoView(
              rep.lines.atIndex(opt_lineNumber).lineNode, true);
        }
      });
    }
  }

  // Public methods.
  return {
    focus: focus,
    getLineAndCharForPoint: getLineAndCharForPoint,
    getSelection: getSelection,
    restoreSelection: restoreSelection,
    scrollNodeVerticallyIntoView: scrollNodeVerticallyIntoView,
    scrollSelectionIntoView: scrollSelectionIntoView,
    setSelection: setSelection,
    setupSelectionToolbar: setupSelectionToolbar,
    updateBrowserSelectionFromRep: updateBrowserSelectionFromRep,
    updateToolbarIfNecessary: updateToolbarIfNecessary
  };
};
