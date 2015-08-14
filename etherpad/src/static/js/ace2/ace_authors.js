ace.authors = function(editor) {
  // presence of key determines if author is present in doc
  var authorInfos = {};
  var shortNames = false;

  /** @return {boolean} Whether to display short names. */
  function getShortNames() {
    return shortNames;
  }
  /** Sets whether we want to display short names. */
  function setShortNames(newVal) {
    shortNames = newVal;
  }

  /** @return {Object} A collection of information on known authors. */
  function getAuthorInfos() {
    return authorInfos;
  }

  /**
   * Sets information about an author.
   * @param {string} author The author unique id.
   * @param {Object} info Info about the author.
   */
  function setAuthorInfo(author, info) {
    if ((typeof author) != "string") {
      throw new Error("setAuthorInfo: author ("+author+") is not a string");
    }

    var dynamicCSS = editor.getDynamicCSS();

    if (!info) {
      delete authorInfos[author];

      if (dynamicCSS) {
        dynamicCSS.removeSelectorStyle(getGutterAuthorColorClassSelector(
            "gutter-" + linestylefilter.getAuthorClassName(author)));
        dynamicCSS.removeSelectorStyle(
            getAuthorColorClassSelector(
                linestylefilter.getAuthorClassName(author)));
      }
    } else {
      authorInfos[author] = info;

      editor.getObserver().trigger('invalidate-cache');

      // Tell your position to the new peers.
      editor.getObserver().trigger('caret', [true /* force update */]);

      if (info.bgcolor) {
        if (dynamicCSS) {
          var bgcolor = info.bgcolor;
          var borderWidth = clientVars.isDesktopApp ? 2 : 4;
          // fade all colors by 60%
          bgcolor = fadeColor(info.bgcolor, .4);
          // fade name color by 20%
          name_bgcolor = fadeColor(info.bgcolor, .2);
          var selector = getGutterAuthorColorClassSelector(
              "gutter-" + linestylefilter.getAuthorClassName(author));
          var gutterStyle = dynamicCSS.selectorStyle(selector);

          if (!browser.msie) {
            // TODO: Why is this setting paddings here??
           if (!clientVars.isDesktopApp && shortNames == "initials") {
              gutterStyle.borderLeft = borderWidth + "px solid white";
              gutterStyle.paddingLeft = "19px";
              gutterStyle.paddingRight = "10px";
            } else {
              gutterStyle.borderLeft = borderWidth + "px solid " + bgcolor;
              gutterStyle.paddingLeft = '54px';
              gutterStyle.paddingRight = '60px';
            }
          } else {
            // Using the border as above inside a contentEditable in IE triggers
            // cursor bugs we may have to change the way we show gutter authors
            // to get around it.
            gutterStyle.paddingLeft = '55px';
            gutterStyle.paddingRight = '60px';
          }

          dynamicCSS.selectorStyle(getNameDivColorClassSelector(
              linestylefilter.getAuthorClassName(author))).color = name_bgcolor;
          dynamicCSS.selectorStyle(getAuthorLineDupesClassSelector(
              linestylefilter.getAuthorClassName(author))).display = 'none';
          dynamicCSS.selectorStyle(getAuthorColorClassSelector(
              linestylefilter.getAuthorClassName(author))).borderBottom =
              "2px dotted " + bgcolor;
          var selector = getAuthorColorChildSelector(
              "gutter-" + linestylefilter.getAuthorClassName(author),
              linestylefilter.getAuthorClassName(author));
          dynamicCSS.selectorStyle(selector).borderBottom = "0px solid " +
              bgcolor;
        }
      }
    }
  }

  /** @return {Array.<string>} List of author names. */
  function getAuthorNames() {
    var names = [];
    for (var author in authorInfos) {
      names.push(authorInfos[author].name);
    }

    return names;
  }

  /**
   * @param {string} oneClassName The class to narrow down by.
   * @return {string} The full selector.
   */
  function getNameDivColorClassSelector(oneClassName) {
    return "#editor .ace-line.gutter-" + oneClassName + ":before";
    // TODO: needs to be decoupled into ace_line_annotator
  }

  /**
   * @param {string} oneClassName The class to narrow down by.
   * @return {string} The full selector.
   */
  function getAuthorLineDupesClassSelector(oneClassName) {
    return ".gutter-" + oneClassName + ":not(.line-list-type-comment) + " +
        ".gutter-" + oneClassName + ":not(.line-list-type-comment):before" +
        ", " +
        ".gutter-" + oneClassName + ":not(.line-list-type-comment) + " +
        ".gutter-noauthor + " +
        ".gutter-" + oneClassName + ":not(.line-list-type-comment):before" +
        ", " +
        ".line-list-type-comment.gutter-" + oneClassName + " + " +
        ".line-list-type-comment.gutter-" + oneClassName + ":before";
    // TODO: needs to be decoupled into ace_line_annotator
  }

  /**
   * @param {string} oneClassName The class to narrow down by.
   * @return {string} The full selector.
   */
  function getGutterAuthorColorClassSelector(oneClassName) {
    return ".edit-mode ." + oneClassName;
  }

  /**
   * @param {string} oneClassName The class to narrow down by.
   * @return {string} The full selector.
   */
  function getAuthorColorClassSelector(oneClassName) {
    return ".authorColors ." + oneClassName;
  }

  /**
   * @param {string} parentClassName The class to narrow down by.
   * @param {string} childClassName The child class to narrow down by.
   * @return {string} The full selector.
   */
  function getAuthorColorChildSelector(parentClassName, childClassName) {
    return ".authorColors ." + parentClassName + " ." + childClassName;
  }

  /**
   * Takes a color and dims it.
   * @param {string} colorCSS The original color.
   * @param {number} The percentage by which to reduce it by.
   */
  function fadeColor(colorCSS, fadeFrac) {
    var color = colorutils.css2triple(colorCSS);
    color = colorutils.blend(color, [1,1,1], fadeFrac);
    return colorutils.triple2css(color);
  }

  // Public methods.
  return {
    getAuthorInfos: getAuthorInfos,
    getAuthorNames: getAuthorNames,
    getShortNames: getShortNames,
    setAuthorInfo: setAuthorInfo,
    setShortNames: setShortNames
  };
};
