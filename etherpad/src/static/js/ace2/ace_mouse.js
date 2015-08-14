/**
 * Handles any mouse events going through the Ace editor and transforms them
 * as necessary into fancy features.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.mouse} The public methods to hook into the mouse handler.
 */
ace.mouse = function(editor) {
  var blockedClicks = [];
  var disableCSSTimer = null;
  var enableCSSTimer = null;
  var root = editor.getRoot();
  var tabWasHidden = false;
  var touchDragged = false;
  var touchStartX;
  var touchStartY;
  var windowScrollLongerTimeout;

  /**
   * Keeps track of clicks to make mobile buttons faster.
   * See: https://developers.google.com/mobile/articles/fast_buttons
   * @param {number} x .
   * @param {number} y .
   */
  function blockClicks(x, y) {
    blockedClicks.push(x, y);
    setTimeout(unblockClicks, 300);
  }

  /**
   * Removes recent clicks that were used to make mobile buttons faster.
   * See: https://developers.google.com/mobile/articles/fast_buttons
   */
  function unblockClicks() {
    blockedClicks.splice(0, 2);
  }

  /**
   * Handles the start of a touch and tracks it.
   * @param {Event} evt .
   */
  function handleTouchStart(evt) {
    touchDragged = false;
    touchStartX = evt.originalEvent.touches[0].clientX;
    touchStartY = evt.originalEvent.touches[0].clientY;
  }

  /**
   * Handles a touch move to detect dragging.
   * @param {Event} evt .
   */
  function handleTouchMove(evt) {
    if (Math.abs(evt.originalEvent.touches[0].clientX - touchStartX) < 10 &&
        Math.abs(evt.originalEvent.touches[0].clientY - touchStartY) < 10) {
      return;
    }
    touchDragged = true;
  }

  /**
   * Keeps track of clicks on mobile to make clicking buttons faster.
   * See: https://developers.google.com/mobile/articles/fast_buttons
   * @param {Event} evt .
   */
  function captureClick(evt) {
    for (var i = 0; i < blockedClicks.length; i += 2) {
      var x = blockedClicks[i];
      var y = blockedClicks[i + 1];
      if (Math.abs(evt.clientX - x) > 25 || Math.abs(evt.clientY - y) > 25) {
        continue;
      }
      evt.stopPropagation();
      evt.preventDefault();
      return;
    }
  }

  /**
   * Handles a click and see we should process it or not, depending on the type
   * of click and platform.
   * @param {Event} evt .
   */
  function processClick(evt) {
    editor.inCallStack("handleClick", function() {
      editor.getIdleWorkTimer().atMost(200);
    });

    var isTouchEvent = evt.type == "touchend";
    if (isTouchEvent) {
      // Don't click when the drag started on a link or checkbox
      if (touchDragged) {
        evt.preventDefault();
        return false;
      }

      blockClicks(touchStartX, touchStartY);
    } else if (evt.ctrlKey || evt.button > 1) {
      // only want to catch left-click
      return false;
    }

    if (isTouchEvent) {
      window.focus(); // for ios
    }

    return true;
  }

  /**
   * Detect if a span is an inline-authored span.
   * @param {Element} element .
   */
  function _isAuthoredSpan(element) {
    if (!element || element.nodeName != "SPAN") {
      return false;
    }

    return getClassArray(element,
        function(c) { return c.match("^author-");}).length;
  }

  /**
   * Grabs child nodes of an element.
   * TODO: replace with jQuery.
   * @param {Element} element .
   */
  function _children(element) {
    var children = [];
    for (var i = 0; i < element.childNodes.length; i++) {
      if (element.childNodes[i].nodeType === 1) {
        children.push(element.childNodes[i]);
      }
    }
    return children;
  }

  /**
   * TODO: replace with jQuery.
   */
  function _isElementChildOf(element, parent) {
    while (element && element != parent) {
      element = element.parentNode;
    }
    if (element == parent) return true;
    return false;
  }

  // the tooltip element
  // TODO: get rid of this / merge with general tooltip ui.
  var tooltipInfo = {};

  /**
   * Creates the tooltip element.
   */
  function ensureTooltipExists() {
    // there can be only one tooltip helper
    if (tooltipInfo.tooltip) {
      return;
    }
    tooltipInfo.tooltip = document.createElement('DIV');
    tooltipInfo.tooltip.innerHTML =
        '<div></div><div class="body"></div><div class="url"></div>';
    tooltipInfo.tooltip.id = "tooltip";
    editor.getRoot().parentNode.appendChild(tooltipInfo.tooltip);
  }

  /**
   * Handles a mouse over event, mainly to show a tooltip for inline authorship.
   * @param {Event} event .
   */
  function handleMouseOver(event) {
    // search for a target
    var element = event.target;
    while (element && !_isAuthoredSpan(element) && element != root) {
      element = element.parentNode;
    }
    if (!_isAuthoredSpan(element) || tooltipInfo.target == element) {
      return;
    }

    // don't show tooltip on line author's spans
    if (getStyle(element, "border-bottom-width") == "0px") {
      return;
    }

    ensureTooltipExists();

    var authorInfos = editor.getAuthorInfos();
    var root = editor.getRoot();
    var authorClasses = getClassArray(element,
        function(c) { return c.match("^author-"); });
    var authors = map(authorClasses, linestylefilter.className2Author);
    var name = authorInfos[authors[0]].name;

    tooltipInfo.target = element;

    var rootOffset = $(root).offset();

    // TODO: this is crappy - this whole tooltip ui.
    // position the helper 15 pixel to bottom right, starting from mouse
    // position
    _children(tooltipInfo.tooltip)[0].innerHTML = domline.escapeHTML(name);
    tooltipInfo.tooltip.style.display = "block";
    tooltipInfo.tooltip.style.left = String($(element).offset().left +
        $(element).outerWidth() / 2 - rootOffset.left -
        $("#tooltip").outerWidth() / 2) + "px";
    tooltipInfo.tooltip.style.right = 'auto';
    tooltipInfo.tooltip.style.backgroundColor =
        authorInfos[authors[0]].bgcolor;
    editor.getDynamicCSS().selectorStyle('#padbody #tooltip:before').
        borderBottomColor = authorInfos[authors[0]].bgcolor;
    tooltipInfo.tooltip.style.top = String($(element).offset().top +
        $(element).outerHeight() - rootOffset.top + 10) + "px";
    tooltipInfo.tooltip.style.position = 'absolute';
  }

  /**
   * Handles the mouse event, mainly to hide inline authorship tooltips now.
   * @param {Event} evt .
   */
  function handleMouseOut(evt) {
    if (tooltipInfo.tooltip) {
      if (!evt.relatedTarget ||
          !_isElementChildOf(evt.relatedTarget, tooltipInfo.target)) {
        tooltipInfo.target = null;
        editor.getDynamicCSS().selectorStyle('#padbody #tooltip:before').
            borderBottomColor = 'rgba(59, 58, 60, 0.95)';
        tooltipInfo.tooltip.style.display = "none";
      }
    }
  }

  /**
   * Handles a click, when in IE, to make sure the editor is focused
   * (I believe).
   * TODO: Needed anymore?  Might be legacy code from nested iframe days.
   * @param {Event} evt .
   */
  function handleIEOuterClick(evt) {
    if ((evt.target.tagName || '').toLowerCase() != "html") {
      return;
    }

    var root = editor.getRoot();
    if (!(evt.pageY > root.clientHeight)) {
      return;
    }

    // click below the body
    editor.inCallStack("handleOuterClick", function() {
      // put caret at bottom of doc
      editor.fastIncorp();
      var rep = editor.getRep();
      if (editor.isCaret()) { // don't interfere with drag
        var lastLine = rep.lines.length() - 1;
        var lastCol = rep.lines.atIndex(lastLine).text.length;
        editor.performSelectionChange([lastLine, lastCol], [lastLine, lastCol]);
      }
    });
  }

  /**
   * Handles various actions that can happen in the editor depending on where
   * the click takes place, including finishing tasks, headings menu, etc.
   * @param {Event} evt .
   */
  function onClickMisc(evt) {
    var root = editor.getRoot();

    var lastAutolinkPosition = editor.getLastAutolinkPosition();
    if (lastAutolinkPosition) {
      var existingAutolink = editor.findAutolinkStartPosition(
          lastAutolinkPosition[0]);
      if (existingAutolink){
        editor.inCallStack("removeAutolink", function() {
          // Makes sure selection is updated
          editor.fastIncorp();
          editor.clearAutolink(existingAutolink);
          editor.setLastAutolinkPosition(null);
        });
      }
    }

    // Attribution links.
    function isDomline(n) {
      return (n.tagName || '').toLowerCase() == "div" &&
          n.className.indexOf("ace-line") > -1;
    }
    n = evt.target;
    while (n && n.parentNode && !isDomline(n)) {
      if (n.tagName.toLowerCase() != "div") {
        n = n.parentNode;
      } else {
        break;
      }
    }

    if (n && (evt.clientX < $(root).offset().left) && isDomline(n) &&
        !browser.mobile && !clientVars.isDesktopApp) {
      if (n.getAttribute('data-author-link')) {
        window.open(n.getAttribute('data-author-link'), '_blank');
      }
      evt.preventDefault();
      return false;
    }

    // Anchor tag.
    function isLink(n) {
      return (n.tagName || '').toLowerCase() == "a" && n.href;
    }
    var n = evt.target;
    while (n && n.parentNode && !isLink(n)) {
      n = n.parentNode;
    }
    if (n && isLink(n)) {
      try {
        var isInternal = !evt.metaKey && hasClass(n.parentNode, "internal");
        var returnValue = editor.getObserver().triggerHandler('open-link',
            [n.href, isInternal]);

        // If the open-link event is unhandled externally from above, we
        // process it here.
        if (returnValue === undefined) {
          if (browser.mobile || isInternal) {
            window.top.location = n.href;
          } else {
            var newWindow = window.open('', '_blank');
            if (newWindow) {
              newWindow.opener = null;
              newWindow.location = n.href;
              newWindow.focus();
            }
          }
        }
      } catch (e) {
        // absorb "user canceled" error in IE for certain prompts
      }

      evt.preventDefault();
      evt.stopPropagation();
      return;
    }

    // Completing a task.
    function isTask(n) {
      return (n.tagName || '').toLowerCase() == "ul" &&
          n.className.indexOf("list-task") > -1;
    }
    n = evt.target;
    while (n && n.parentNode && !isTask(n)) {
      if (n.tagName.toLowerCase() == "li") {
        n = n.parentNode;
      } else {
        break;
      }
    }
    var clientX =  evt.clientX ||
        (evt.originalEvent.changedTouches[0].pageX - evt.target.offsetLeft);
    clientX -= $(root).offset().left;
    var hitAreaOffset = 10;
    if (n && (evt.offsetX < 0 || clientX < (n.offsetLeft - hitAreaOffset)) &&
        isTask(n)) {
      if (n.className.indexOf("list-taskdone") > -1) {
        n.className = n.className.replace('list-taskdone', 'list-task').
            replace('listtype-taskdone', 'listtype-task');
      } else if (n.className.indexOf("list-task") > -1) {
        n.className = n.className.replace('list-task', 'list-taskdone').
            replace('listtype-task', 'listtype-taskdone');
      }

      evt.preventDefault();
      evt.stopPropagation();
      return;
    }

    // Headings menu.
    function isHeading(n) {
      return (n.tagName || '').toLowerCase() == "ul" &&
          n.className.indexOf("list-h") > -1;
    }
    n = evt.target;
    while (n && n.parentNode && !isHeading(n)) {
      if (n.tagName.toLowerCase() == "li") {
        n = n.parentNode;
      } else {
        break;
      }
    }

    var extraMouseOffset = clientVars.isDesktopApp ? 30 : 0;
    if (n && (evt.offsetX < 0 || clientX - 20 - extraMouseOffset <
        n.offsetLeft) && isHeading(n) && !browser.mobile) {
      editor.showHeadingsMenu(evt);
      evt.preventDefault();
      return;
    }

    // Old style headings.
    function isOldStyleHeading(n) {
      return (n.tagName || '').toLowerCase() == "div" &&
          n.className.indexOf("toc-entry") > -1;
    }
    n = evt.target;
    while (n && n.parentNode && !isOldStyleHeading(n)) {
      if (n.tagName.toLowerCase() != "div") {
        n = n.parentNode;
      } else {
        break;
      }
    }
    if (n && (evt.offsetX < 57 + extraMouseOffset || clientX < 57 +
        extraMouseOffset) && isOldStyleHeading(n) && !browser.mobile) {
      editor.showHeadingsMenu(evt);
      evt.preventDefault();
      return false;
    }

    // Tex.
    function isTex(n) {
      return (n.tagName || '').toLowerCase() == "span" &&
          n.className.indexOf("inline-tex") > -1;
    }
    n = evt.target;
    while (n && n.parentNode && ! isTex(n)) {
      n = n.parentNode;
    }
    if (n && isTex(n)) {
      n.parentNode.className = n.parentNode.className.replace("tex", '');
      n.parentNode.innerHTML = n.getAttribute("tex").replace(/\$\$$/, "$");
    }
  }

  /**
   * Handles international input events, fired in FF3, at least;
   * allow e.g. Japanese input.
   * @param {Event} evt .
   */
  function onCompositionEvent(evt) {
    if (evt.type == "compositionstart") {
      editor.setInInternationalComposition(true);
    } else if (evt.type == "compositionend") {
      editor.setInInternationalComposition(false);
    }
  }

  /**
   * Handles the scroll event.
   */
  function onScroll() {
    editor.setIsScrolling(true);
    window.clearTimeout(windowScrollLongerTimeout);
    windowScrollLongerTimeout = window.setTimeout(function() {
      editor.getObserver().trigger('scroll-finished');
      editor.setIsScrolling(false);
    }, 100);
  }

  /**
   * Handles the focus event.
   * @param {Event} evt .
   */
  function onFocus(evt) {
    editor.restoreSelection();

    $('body').addClass('ace-focused');
    $('body').addClass('edit-mode');

    if (!browser.msie) {
      enableCSSSoon();
    }

    if (clientVars.demoMode) {
      editor.getObserver().trigger('track', ['demofocus']);
    }
  }

  /**
   * Handles the blur event.
   * @param {Event} evt .
   */
  function onBlur(evt) {
    // We do setTimeout 33 here so that you can click on the names in the
    // sidebar.
    setTimeout(function() { $('body').removeClass('ace-focused'); }, 33);

    if (!browser.msie) {
      disableCSSSoon();
    }

    if (browser.msie) {
      // TODO: Needed anymore, post-iframe world?
      // a fix: in IE, clicking on a control like a button outside the
      // iframe can "blur" the editor, causing it to stop getting
      // events, though typing still affects it(!).
      editor.setSelection(null);
    }
  }

  /**
   * Enables author colors when focused.
   */
  function disableCSSSoon() {
    clearTimeout(enableCSSTimer);
    disableCSSTimer = setTimeout(function() {
      tabWasHidden = document.hidden || document.mozHidden ||
          document.msHidden || document.webkitHidden;
      if (!tabWasHidden) {
        setClassPresence(root, "authorColors", false);
      }
    }, 100);
  }

  /**
   * Disables author colors when blurred.
   */
  function enableCSSSoon() {
    clearTimeout(disableCSSTimer);
    enableCSSTimer = setTimeout(function() {
      if (!tabWasHidden) {
        setClassPresence(root, "authorColors", true);
      }
    }, 100);
  }

  return {
    captureClick: captureClick,
    handleIEOuterClick: handleIEOuterClick,
    handleMouseOut: handleMouseOut,
    handleMouseOver: handleMouseOver,
    handleTouchMove: handleTouchMove,
    handleTouchStart: handleTouchStart,
    onBlur: onBlur,
    onClickMisc: onClickMisc,
    onCompositionEvent: onCompositionEvent,
    onFocus: onFocus,
    onScroll: onScroll,
    processClick: processClick
  };
};
