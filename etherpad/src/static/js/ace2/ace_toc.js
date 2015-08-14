/**
 * Maintains and updates the TOC for an editor.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.ui.toc} The public methods to interact with a TOC.
 */
ace.ui.toc = function(editor) {
  var _tableOfContents = [];
  var _halfDoneToc = [];
  var _halfDoneTocIndex = 0;
  var lineIdCache = {};

  /**
   * Progressively scans through the document looking for the latest valid
   * TOC entries.  Will scan for certain amount of time (isTimeUp) so that the
   * JS doesn't freeze up and then returns, even if it's not finished yet, and
   * later returns on the next idle cycle to continue updating.
   */
  function updateTableOfContents(isTimeUp) {
    var rep = editor.getRep();
    var root = editor.getRoot();

    var tempToc = [];
    var boldAttrNum = rep.apool.attribToNum[['bold','true']];
    var urlBeforeFragment = domline.escapeHTML(
        document.location.href.split("#")[0]);

    if (!lineIdCache['toc-div']) {
      lineIdCache['toc-div'] = [];
    }

    var foundDirty = false;
    for (var x = 0; x < root.childNodes.length; ++x) {
      if (lineIdCache['toc-div'][x] != root.childNodes[x].id) {
        foundDirty = true;
        lineIdCache['toc-div'][x] = root.childNodes[x].id;
      }
    }
    if (!foundDirty && !_halfDoneToc.length) {
      return;
    }
    if (foundDirty) {
      _halfDoneToc = [];
      _halfDoneTocIndex = 0;
    }

    if (_halfDoneToc.length) {
      tempToc = _halfDoneToc;
    }
    var startIndex = _halfDoneTocIndex ? _halfDoneTocIndex : 1;

    for (var i = startIndex; i < rep.alines.length; i++) {
      if (i % 10 == 0 && isTimeUp()) {
        _halfDoneToc = tempToc;
        _halfDoneTocIndex = i;
        return;
      }

      var aline = rep.alines[i];
      var boldLen = 0;
      var opIter = Changeset.opIterator(aline);


      var hasMagicObject = false;
      while (opIter.hasNext()) {
        var o = opIter.next();
        Changeset.eachAttribNumber(o.attribs, function(n) {
          if (n == boldAttrNum) {
            boldLen += o.chars;
          }
          if (Changeset.opAttributeValue(o, 'table', rep.apool) ||
            Changeset.opAttributeValue(o, 'embed', rep.apool) ||
            Changeset.opAttributeValue(o, 'img', rep.apool)) {
            hasMagicObject = true;
          }
        });
      }
      if (hasMagicObject) {
        continue;
      }


      var lineEntry = rep.lines.atIndex(i);
      var lineNode = lineEntry.lineNode;
      var lineText = lineEntry.text;
      var lineTextLength = lineText.length;
      var lineListType = editor.getLineListType(i);
      var distBelowTop = lineNode.offsetTop;

      // if full line is bold add to tempToc
      if (lineListType.indexOf("hone") > -1) {
        lineText = lineText.substr(lineEntry.lineMarker);
        if (lineText && _trim(lineText).length) {
          tempToc.push([distBelowTop, lineText, -1 /*h1*/, urlBeforeFragment +
              editor.locationFragmentForHeading(lineText), lineNode.id]);
        }
      } else if (boldLen > 0 &&
          (!lineListType || lineListType.indexOf("indent") > -1) &&
              lineTextLength > 0 && (boldLen >= (lineEntry.lineMarker ?
                  lineTextLength-lineEntry.lineMarker : lineTextLength))) {
        var listLevel = 0;
        if (lineEntry.lineMarker) {
          var listType = lineListType;
          if (listType) {
            listType = /([a-z]+)([12345678])/.exec(listType);
            if (listType) {
              var t = listType[1];
              var listLevel = Number(listType[2]);
            }
          }
          lineText = lineText.substr(lineEntry.lineMarker);
        }

        if (lineText && _trim(lineText).length) {
          tempToc.push([distBelowTop, lineText, listLevel, urlBeforeFragment +
              editor.locationFragmentForHeading(lineText), lineNode.id]);
          if (lineNode.className.indexOf("toc-entry") == -1) {
            lineNode.className += " toc-entry";
          }
        }
      // otherwise - remove toc-entry ness (no longer in toc)
      } else if (lineNode.className.indexOf("toc-entry") > -1) {
        lineNode.className = lineNode.className.replace("toc-entry", "");
      }
    }

    _halfDoneToc = [];
    _halfDoneTocIndex = 0;

    function updateTOC() {
      _tableOfContents = tempToc;
      renderTableOfContents(tempToc);
      updateCurrentTOC();
    }

    if (_tableOfContents.length != tempToc.length) {
      updateTOC();
      return;
    }
    for (var idx in tempToc) {
      if (tempToc[idx][0] != _tableOfContents[idx][0] ||
          tempToc[idx][1] != _tableOfContents[idx][1] ||
          tempToc[idx][2] != _tableOfContents[idx][2] ||
          tempToc[idx][3] != _tableOfContents[idx][3] ||
          tempToc[idx][4] != _tableOfContents[idx][4] ) {
        updateTOC();
        return;
      }
    }
  }

  /**
   * Forces a fresh redraw of the TOC from the top.
   */
  function invalidateCache() {
    lineIdCache = {};
  }

  /**
   * Highlights the TOC html entry that is currently in view on the screen.
   */
  function updateCurrentTOC() {
    var latestEl;
    var scrollTop = $(window).scrollTop();
    var headerHeight = $('body > header').outerHeight();
    var fuzz = 50;
    var rootSelector = editor.getRootSelector();

    $(rootSelector + ' .list-hone1, ' + rootSelector +
        ' .toc-entry').each(function(index, el) {
      var magicDomNode = editor.findMagicDomNode(el);
      if ($(el).offset().top > scrollTop + headerHeight + fuzz) {
        return false;
      }
      latestEl = magicDomNode;
    });

    var oldToc = $('#toc-div .toc-entry.current');
    oldToc.removeClass('current');

    if (latestEl) {
      $('#toc-div .toc-entry[data-node-id=' + latestEl.id + ']').
          addClass('current');
      var currentToc = $('#toc-div .toc-entry.current');
      if (currentToc.length && oldToc[0] != currentToc[0]) {
        $('#toc-div').scrollTop(currentToc.offset().top -
            $('#toc-div').offset().top - currentToc.outerHeight(true) +
            $('#toc-div').scrollTop());
      }
    }
  }

  /**
   * Changes the TOC height depending on the browser window height.
   */
  function updateTocHeight() {
    var sidebar = $('#padsidebar');
    var toc = $('#toc-div');
    if (!toc.length) {
      return;
    }
    toc.css({
      'max-height': Math.max(250,
          $(window).height() - toc.position().top - 150)
    });
  }

  /**
   * Renders the actual HTML for the TOC.
   * @param {Array.<number, string, number, string, string>} toc An array of
   *     various attributes.  Argh, don't blame me - this is some crappy
   *     passing of data.
   */
  function renderTableOfContents(toc) {
    $('#toc-div .toc-entry').remove();
    var idx = 0;
    for (; idx < toc.length; idx++) {
      var indent = toc[idx][2];
      var escaped = padutils.escapeHtml(toc[idx][1]);

      var a = $("<a href='"+ toc[idx][3] +"'/>").attr({ tooltip: escaped, title:
          escaped, offset: toc[idx][0] }).html(escaped);
      var li = $("<li class='toc-entry level" + (indent+1) +
          "' data-node-id='" + toc[idx][4] + "'/>").append(a);
      if (indent != -1) {
        li.css('margin-left', indent + 'em');
      }
      $('#toc-div ul').append(li);
    }
    if (toc.length > 9) {
      $('#toc-div ul').addClass("more-than-nine");
    } else {
      $('#toc-div ul').removeClass("more-than-nine");
    }
    $('#toc-div .sidebarheading').toggle(idx > 0);

    var wide = $("#padsidebar [data-tooltip]").filter(
        function() { return $(this).width() >= 160});
    padutils.tooltip(wide);

    updateTocHeight();
  }

  // Setup click behavior for the TOC.
  $(".toc-entry a").live("click", function(ev) {
    var offset = parseInt($(this).attr('offset')) +
        $('#padpage')[0].offsetTop - $('#padbar').outerHeight();
    $("html, body").animate({ scrollTop: offset }, 100);
    // we don't just let the navigation happen because the offset above is
    // guaranteed to be right whereas the link is optimistic
    document.location.href = $(this).attr('href');
    return false;
  });

  // Setup scroll/resize behaviors for the TOC.
  if (!padutils.getIsMobile()) {
    // static toc
    var sidebar = $('#padsidebar');
    var toc = $('#toc-div');
    var tocOnScroll = function() {
      if ($('body').hasClass('embed')) { return; }
      var topHeight = $('body > header').height();
      sidebar.css({
        top: topHeight + 'px',
        left: $('#editor').offset().left +
            $('#editor').outerWidth(true) + 10 }).
        addClass('fixed');
      updateTocHeight();
    };

    $(window).scroll(throttle(tocOnScroll, 33));
    tocOnScroll();
    $(window).resize(throttle(tocOnScroll, 33));
    $(window).resize(function() {
      updateTocHeight();
    });
  }

  // Public methods.
  return {
    invalidateCache: invalidateCache,
    updateCurrentTOC: updateCurrentTOC,
    updateTableOfContents: updateTableOfContents
  };
};
