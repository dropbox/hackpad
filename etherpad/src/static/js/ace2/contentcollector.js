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


// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.contentcollector
if (typeof(server_side_import)!='undefined') {
  server_side_import("etherpad.collab.ace.easysync2.Changeset");
}


var _MAX_LIST_LEVEL = 8;
var ZEROWIDTH_SPACE = "\u200b";


function sanitizeUnicode(s) {
  return s.replace(/[\uffff\ufffe\ufeff\ufdd0-\ufdef\ud800-\udfff]/g, '?');
}

function makeContentCollector(collectStyles, browser, apool, domInterface,
                              className2Author) {

  browser = browser || {};

  var dom = domInterface || {
    isNodeText: function(n) {
      return (n.nodeType == 3);
    },
    nodeTagName: function(n) {
      return n.tagName;
    },
    nodeValue: function(n) {
      return n.nodeValue;
    },
    nodeNumChildren: function(n) {
      return n.childNodes.length;
    },
    nodeChild: function(n, i) {
      return n.childNodes.item(i);
    },
    nodeProp: function(n, p) {
      var svgNS = 'http://www.w3.org/2000/svg';
      if (p == "className" && n.namespaceURI == svgNS) {
        return n[p].baseVal;
      }
      return n[p];
    },
    nodeAttr: function(n, a) {
      return n.getAttribute && n.getAttribute(a);
    },
    optNodeInnerHTML: function(n) {
      return n.innerHTML;
    }
  };

  var _blockElems = { "div":1, "p":1, "pre":1, "li":1, "table":1 };
  function isBlockElement(n) {
    return !!_blockElems[(dom.nodeTagName(n) || "").toLowerCase()];
  }
  function textify(str) {
    return sanitizeUnicode(
      str.replace(/\u200b/g, "").replace(/[\n\r ]/g, ' ').replace(/\xa0/g, ' ').replace(/\t/g, '        '));
  }
  function textifyTitleFragment(str) {
    return textify(str).replace(/-/g, ' ');
  }
  function getAssoc(node, name) {
    return dom.nodeProp(node, "_magicdom_"+name);
  }

  var lines = (function() {
    var textArray = [];
    var attribsArray = [];
    var attribsBuilder = null;
    var op = Changeset.newOp('+');
    var self = {
      length: function() { return textArray.length; },
      atColumnZero: function() {
        return textArray[textArray.length-1] === "";
      },
      startNew: function() {
        textArray.push("");
        self.flush(true);
        attribsBuilder = Changeset.smartOpAssembler();
      },
      textOfLine: function(i) { return textArray[i]; },
      appendText: function(txt, attrString) {
        textArray[textArray.length-1] += txt;
        op.attribs = attrString;
        op.chars = txt.length;
        attribsBuilder.append(op);
      },
      textLines: function() { return textArray.slice(); },
      attribLines: function() { return attribsArray; },
      // call flush only when you're done
      flush: function(withNewline) {
        if (attribsBuilder) {
          attribsArray.push(attribsBuilder.toString());
          attribsBuilder = null;
        }
      }
    };
    self.startNew();
    return self;
  }());
  var cc = {};
  function _ensureColumnZero(state) {
    if (! lines.atColumnZero()) {
      cc.startNewLine(state);
    }
  }
  var newAuthors = [];
  var selection, startPoint, endPoint;
  var selStart = [-1,-1], selEnd = [-1,-1];
  var blockElems = { "div":1, "p":1, "pre":1 };
  var nestedDomLines = false;
  var nestedGutters = 0; // helper
  function _isEmpty(node, state) {
    // consider clean blank lines pasted in IE to be empty
    if (dom.nodeNumChildren(node) == 0) return true;
    if (dom.nodeNumChildren(node) == 1 &&
        getAssoc(node, "shouldBeEmpty") && dom.optNodeInnerHTML(node) == "&nbsp;"
        && ! getAssoc(node, "unpasted")) {
      if (state) {
        var child = dom.nodeChild(node, 0);
        _reachPoint(child, 0, state);
        _reachPoint(child, 1, state);
      }
      return true;
    }
    return false;
  }
  function _pointHere(charsAfter, state) {
    var ln = lines.length()-1;
    var chr = lines.textOfLine(ln).length;
    if (chr == 0 && state.listType && state.listType != 'none') {
      chr += 1; // listMarker
    }
    chr += charsAfter;
    return [ln, chr];
  }
  function _reachBlockPoint(nd, idx, state) {
    if (! dom.isNodeText(nd)) _reachPoint(nd, idx, state);
  }
  function _reachPoint(nd, idx, state) {
    if (startPoint && nd == startPoint.node && startPoint.index == idx) {
      selStart = _pointHere(0, state);
    }
    if (endPoint && nd == endPoint.node && endPoint.index == idx) {
      selEnd = _pointHere(0, state);
    }
  }
  cc.incrementFlag = function(state, flagName) {
    state.flags[flagName] = (state.flags[flagName] || 0)+1;
  }
  cc.decrementFlag = function(state, flagName) {
    state.flags[flagName]--;
  }
  cc.incrementAttrib = function(state, attribName) {
    if (! state.attribs[attribName]) {
      state.attribs[attribName] = 1;
    }
    else {
      state.attribs[attribName]++;
    }
    _recalcAttribString(state);
  }
  cc.decrementAttrib = function(state, attribName) {
    state.attribs[attribName]--;
    _recalcAttribString(state);
  }
  function _enterNormal(state) {
    var oldSavedFontAttribs = state.savedFontAttribs;
    state.savedFontAttribs = state.attribs;
    state.attribs = {};
    _recalcAttribString(state);

  }
  function _exitNormal(state, oldSavedFontAttribs) {
    state.attribs = state.savedFontAttribs;
    state.savedFontAttribs = oldSavedFontAttribs;
    _recalcAttribString(state);
  }
  function _enterList(state, listType, start) {
    var oldListType = state.listType;
    state.listLevel = (state.listLevel || 0)+1;
    if (listType != 'none') {
      state.listNesting = (state.listNesting || 0)+1;
    }
    state.listType = listType;
    state.listStart = start;
    _recalcAttribString(state);
    return oldListType;
  }
  function _exitList(state, oldListType) {
    state.listLevel--;
    if (state.listType != 'none') {
      state.listNesting--;
    }
    state.listType = oldListType;
    delete state.lang;
    delete state.listStart;
    _recalcAttribString(state);
  }
  function _enterAuthor(state, author) {
    var oldAuthor = state.author;
    state.authorLevel = (state.authorLevel || 0)+1;
    state.author = author;
    _recalcAttribString(state);
    return oldAuthor;
  }
  function _exitAuthor(state, oldAuthor) {
    state.authorLevel--;
    state.author = oldAuthor;
    _recalcAttribString(state);
  }
  function _recalcAttribString(state) {
    var lst = [];
    for(var a in state.attribs) {
      if (state.attribs[a] && !state.table) {
        lst.push([a,'true']);
      }
    }
    if (state.link) {
        var linkAttrib = ['link', state.link];
        lst.push(linkAttrib);
    }
    if (state.img) {
        var imgAttrib = ['img', state.img];
        lst.push(imgAttrib);
    }
    if (state.embed) {
        var embedAttrib = ['embed', state.embed];
        lst.push(embedAttrib);
    }
    if (state.table) {
        for (var i=0; i<state.table.length; i++) {
          var cellAttrib = [state.table[i][0]/*row:col*/, state.table[i][1]/*value*/];
          lst.push(cellAttrib);
        }
        var tableAttrib = ['table', true];
        lst.push(tableAttrib);
    }
    if (state.tex) {
      var texAttrib = ['tex', state.tex];
      lst.push(texAttrib);
    }
    if (state.authorLevel > 0) {
      var authorAttrib = ['author', state.author];

      if(apool.putAttrib(authorAttrib, true) == -1) {
        // if this author isn't already in the apool, add them
        apool.putAttrib(authorAttrib, false);
        newAuthors.push(state.author);
      }

      lst.push(authorAttrib);
    }
    // this call adds any missing attributes to the apool
    state.attribString = Changeset.makeAttribsString('+', lst, apool);
  }

  function _produceListMarker(state) {
    var attribs = [['list', state.listType],
                   ['insertorder', 'first']];
    if (state.listStart) {
      attribs.push(['start', state.listStart]);
      state.listStart = parseInt(state.listStart) + 1;
    }
    if (state.lang) {
      attribs.push(['lang', state.lang]);
    }

    if (state.author) {
      var authorAttrib = ['author', state.author];
      if(apool.putAttrib(authorAttrib, true) == -1) {
        // if this author isn't already in the apool, add them
        apool.putAttrib(authorAttrib, false);
        newAuthors.push(state.author);
      }
      attribs.push(authorAttrib);
    }

    lines.appendText('*', Changeset.makeAttribsString(
      '+', attribs, apool));
  }



  cc.startNewLine = function(state) {
    if (state && state.table) {
      return;
    }

    // detect pasted domlines
    if (nestedGutters > 1) {
      nestedDomLines = true;
    }
    nestedGutters = 0;

    if (state) {
      var atBeginningOfLine = lines.textOfLine(lines.length()-1).length == 0;
      if (atBeginningOfLine && state.listType && state.listType != 'none' && !state.table) {
        _produceListMarker(state);
      }
    }
    lines.startNew();
  }
  cc.notifySelection = function (sel) {
    if (sel) {
      selection = sel;
      startPoint = selection.startPoint;
      endPoint = selection.endPoint;
    }
  };
  cc.doAttrib = function(state, na) {
    state.localAttribs = (state.localAttribs || []);
    state.localAttribs.push(na);
    cc.incrementAttrib(state, na);
  };
  cc.collectContent = function (node, state) {
    function _renderPrettyLink(preTxt, url, urlTitle, newUrl, postTxt) {
      // adjust selection by the amount of text we're removing
      var selectionOffset = (url.length-urlTitle.length);
      selStart[1] = selStart[1] - selectionOffset;
      selEnd[1] = selEnd[1] - selectionOffset;

      if (preTxt && preTxt.length) {
        lines.appendText(textify(preTxt), state.attribString);
      }

      // insert the url
      if (newUrl) {
        state.link = newUrl;
      }
      _recalcAttribString(state);
      lines.appendText(textifyTitleFragment(urlTitle), state.attribString);

      state.link = null;
      _recalcAttribString(state);

      if (postTxt && postTxt.length) {
        lines.appendText(textify(postTxt), state.attribString);
      }

      txt2 ="";
    }

    if (! state) {
      state = {flags: {/*name -> nesting counter*/},
               localAttribs: null,
               link: null,
               columnId: null,
               rowId: null,
               attribs: {/*name -> nesting counter*/},
               attribString: ''};
    }
    var localAttribs = state.localAttribs;
    state.localAttribs = null;
    var isBlock = isBlockElement(node);
    var isEmpty = _isEmpty(node, state);
    if (isBlock) _ensureColumnZero(state);
    var collectChildren = true;
    var startLine = lines.length()-1;
    _reachBlockPoint(node, 0, state);
    if (dom.isNodeText(node)) {
      var txt = dom.nodeValue(node);
      // if collecting html from microsoft word, collapse spaces aggressively
      if (state.MsoNormal) {
        txt = txt.replace(/\s+/g, ' ');
      }
      var rest = '';
      var x = 0; // offset into original text
      if (txt.length == 0) {
        if (startPoint && node == startPoint.node) {
          selStart = _pointHere(0, state);
        }
        if (endPoint && node == endPoint.node) {
          selEnd = _pointHere(0, state);
        }
      }
      while (txt.length > 0) {
        var consumed = 0;
        if (state.flags.preMode) {
          var firstLine = txt.split('\n',1)[0];
          consumed = firstLine.length+1;
          rest = txt.substring(consumed);
          txt = firstLine;
        }
        else { /* will only run this loop body once */ }
        if (startPoint && node == startPoint.node &&
            startPoint.index-x <= txt.length) {
          selStart = _pointHere(startPoint.index-x, state);
        }
        if (endPoint && node == endPoint.node &&
            endPoint.index-x <= txt.length) {
          selEnd = _pointHere(endPoint.index-x, state);
        }

        // adjust selection for ZEROWIDTH_SPACE
        if (txt[0] == ZEROWIDTH_SPACE) {
          if (selStart[1] > -1) {
            selStart[1]--;
          }
          if (selEnd[1] > -1) {
            selEnd[1]--;
          }
        }

        var txt2 = txt;
        if ((! state.flags.preMode) && /^[\r\n]*$/.exec(txt)) {
          // prevents textnodes containing just "\n" from being significant
          // in safari when pasting text, now that we convert them to
          // spaces instead of removing them, because in other cases
          // removing "\n" from pasted HTML will collapse words together.
          txt2 = "";
        }
        var atBeginningOfLine = lines.textOfLine(lines.length()-1).length == 0;
        if (atBeginningOfLine) {
          // newlines in the source mustn't become spaces at beginning of line box
          txt2 = txt2.replace(/^\n*/, '');
        }
        if (atBeginningOfLine && state.listType && state.listType != 'none' && !state.table) {
          _produceListMarker(state);
        }

        // hackpad link shortening
        // i am not 100% sure this is the best approach, but it's the best way i've found
        // open to alternate ideas.

        // if there's an image link in the pasted
        // NOTE: this re is duplicated in wiky.js;  you should prolly update both
        var imgRe = new RegExp("^[\\s]*((http|https)://[^\\s]+\.(png|jpg|jpeg|gif|svg)(\\?.*)?)[\\s]*$", "i");
        var imgMatch = txt.match(imgRe);
        // avoid dropbox "images" - let embedly handle them
        if (imgMatch && !state.link && !txt.match(/https:\/\/www.dropbox.com/)) {
          state.img = imgMatch[1];
          _recalcAttribString(state);
          lines.appendText("*", state.attribString);
          state.img = null;
          _recalcAttribString(state);
          cc.startNewLine(state);
          selStart[0]++; selStart[1] = txt2.length;
          selEnd[0]++; selEnd[1] = txt2.length;
        } else if (typeof(embedlyUrl) != "undefined") {
          var embedRe = new RegExp("^[\\s]*((http|https)://[^\\s]+)[\\s]*$", "i");
          var embedMatch = txt.match(embedRe);
          if (embedMatch && !state.link && embedlyUrl(embedMatch[1])) {
            state.embed = embedMatch[1];
            _recalcAttribString(state);
            lines.appendText("*", state.attribString);
            state.embed = null;
            _recalcAttribString(state);
            cc.startNewLine(state);
            selStart[0]++; selStart[1] = txt2.length;
            selEnd[0]++; selEnd[1] = txt2.length;
          }
        }

        if (typeof(location) != "undefined") {
          var linkRe = new RegExp("(.*)("+location.protocol+'//'+location.host+"/([^\\s]+)#([^:][^\\s]+))(.*)");
          var linkMatch = txt.match(linkRe);
          if (linkMatch) {
            _renderPrettyLink(linkMatch[1], linkMatch[2], linkMatch[4], "/" + linkMatch[3], linkMatch[5]);
          } else {
            linkRe = new RegExp("(.*)("+location.protocol+'//'+location.host+"/([^\\s#]+)-([a-zA-Z0-9]{11}))(#[^\\s]+)?(.*)");
            linkMatch = txt.match(linkRe);
            if (linkMatch) {
              var headingTitle = linkMatch[5] ?  ": "+linkMatch[5].replace(/#:h=/, "") : "";
              _renderPrettyLink(linkMatch[1], linkMatch[2], linkMatch[3]+headingTitle, "/" + linkMatch[4]+(linkMatch[5]||""), linkMatch[6]);
            }
          }
        }

        // pretty-print github issue links
        var linkRe = new RegExp("(.*)(https://github.com/([^/]+)/([^/]+)/(issues|pull)/([\\d]+))(.*)");
        var linkMatch = txt.match(linkRe);
        if (linkMatch) {
          _renderPrettyLink(linkMatch[1], linkMatch[2], linkMatch[3]+"/"+linkMatch[4]+"#"+linkMatch[6], linkMatch[2], linkMatch[7]);
        }

        // Replace native emoji characters.
        // Read more on sets: http://en.wikipedia.org/wiki/Emoji
        var emojiRe = new RegExp("(.*)(\ud83c\udccf|\ud83c\udc04|\ud83c[\udd70-\ude51][^\ud83c]|\ud83c[\udde6-\uddff]\ud83c[\udde6-\uddff]|\ud83c[\udf00-\udfff]|\ud83d[\udc00-\ude4f]|\ud83d[\ude80-\udeff]|[\u2000-\u3299]\ufe0f|[\u23e9-\u23f3]|\u26ce|[\u2705-\u27bf]|[\u0030-\u0039]\ufe0f\u20e3)(.*)");
        var emojiMatch = txt.match(emojiRe);
        var convertToCodePoint = function(str, opt_higherBit) {
          return ((((emojiMatch[2].charCodeAt(opt_higherBit ? 2 : 0) - 0xd800) << 10) |
              (emojiMatch[2].charCodeAt(opt_higherBit ? 3 : 1) - 0xdc00)) + 0x10000).toString(16);
        };
        if (emojiMatch) {
          var codePoint;
          if (emojiMatch[2].length == 4) {
            // Flags: http://en.wikipedia.org/wiki/Regional_Indicator_Symbol
            codePoint = convertToCodePoint(emojiMatch[2]).toLowerCase() + '_' +
                convertToCodePoint(emojiMatch[2], true /* higher bit */).
                toLowerCase();
          } else if (emojiMatch[2].charCodeAt(0) >= 0x2000 &&
              emojiMatch[2].charCodeAt(0) <= 0x3299) {
            // Miscellaneous Symbols.
            codePoint = emojiMatch[2].charCodeAt(0).toString(16).toLowerCase();
          } else if (emojiMatch[2].charCodeAt(0) >= 0x30 &&
              emojiMatch[2].charCodeAt(0) <= 0x39) {
            codePoint = '00' + emojiMatch[2].charCodeAt(0).toString(16) + '_' +
                emojiMatch[2].charCodeAt(2).toString(16);
          } else {
            // Miscellaneous Symbols And Pictographs.
            codePoint = convertToCodePoint(emojiMatch[2]);
          }
          _renderPrettyLink(emojiMatch[1], emojiMatch[2], ':emoji_' +
              codePoint + ': ', undefined, emojiMatch[3]);
        }

        if (state.table) {
          // if we're inside a table, we don't output anything until we are
          // done parsing the table
          state.table.push([state.rowId+":"+state.columnId, textify(txt2)]);
        } else {
          lines.appendText(textify(txt2), state.attribString);
        }

        x += consumed;
        txt = rest;
        if (txt.length > 0) {
          cc.startNewLine(state);
        }
      }
    }
    else {
      var tname = (dom.nodeTagName(node) || "").toLowerCase();
      var cls = dom.nodeProp(node, "className");
      if (!cls) {
        cls = dom.nodeAttr(node, "class");
      }

      if (tname == "br") {
        cc.startNewLine(state);
      }
      else if (tname == "script" || tname == "style") {
        // ignore
      }
      else if (tname == "img" && (cls && /inline-img/.exec(cls))) {
        state.img = dom.nodeAttr(node, "src");

        _recalcAttribString(state);
        lines.appendText("*", state.attribString);
        state.img = null;
        _recalcAttribString(state);
      }
      else if ((tname == "span" && (cls && /inline-embed/.exec(cls)))) {
        state.embed = dom.nodeAttr(node, "embed");
        _recalcAttribString(state);
        lines.appendText("*", state.attribString);

        state.embed = null;
        _recalcAttribString(state);

        collectChildren = false;
      }
      /*
      else if ((tname == "span" && (cls && /inline-table/.exec(cls)))) {
        collectChildren = true;
        state.table = [];
        _recalcAttribString(state);
        lines.appendText("*", state.attribString);
        state.table = null;
        _recalcAttribString(state);
        collectChildren = false;
      } */
      else if ((tname == "span" && (cls && /inline-tex/.exec(cls)))) {
        state.tex = dom.nodeAttr(node, "tex");
        _recalcAttribString(state);
        lines.appendText("*", state.attribString);
        state.tex = null;
        _recalcAttribString(state);
      }
      else if (isEmpty && state.table && (tname == "td" || tname == "th")) {
        state.columnId++;
      }

      else if (! isEmpty) {
        if (cls && /MsoNormal/.exec(cls)) {
          state.MsoNormal = true;
        }

        var styl = dom.nodeAttr(node, "style");

        var isPre = (tname == "pre");
        if ((! isPre) && browser.safari) {
          isPre = (styl && /\bwhite-space:\s*pre\b/i.exec(styl));
        }
        if (isPre) cc.incrementFlag(state, 'preMode');
        var oldListTypeOrNull = null;
        var oldSavedFontAttribs = null;
        var oldAuthorOrNull = null;
        if (collectStyles) {
          if (styl && /\bfont-weight:\s*normal\b/i.exec(styl)) {
            oldSavedFontAttribs = (_enterNormal(state) || {});
          }
          // don't match "mso-rtl-font-weight:bold", whatever that is
          if (tname == "b" || (styl && /(?:[^-]|^)(font-weight:\s*bold\b)/i.exec(styl)) ||
              tname == "strong") {
            cc.doAttrib(state, "bold");
          }
          if (tname == "i" || (styl && /\bfont-style:\s*italic\b/i.exec(styl)) ||
              tname == "em") {
            cc.doAttrib(state, "italic");
          }
          if (tname == "code" || tname == "pre") {
            //cc.doAttrib(state, "code");
            oldListTypeOrNull = (_enterList(state, 'code1') || 'none');
            if (!isPre) {
              isPre = true;
              cc.incrementFlag(state, 'preMode');
            }
          }
          if (cls && cls.match("highlight")) {
            cc.doAttrib(state, "highlight");
          }

          if (tname == "u" || (styl && /\btext-decoration:\s*underline\b/i.exec(styl)) ||
              tname == "ins") {
            cc.doAttrib(state, "underline");
          }
          if (tname == "s" || (styl && /\btext-decoration:\s*line-through\b/i.exec(styl)) ||
              tname == "del" || tname == "strike") {
            cc.doAttrib(state, "strikethrough");
          }
          if (tname == "sup") {
            cc.doAttrib(state, "superscript");
          }
          if (tname == "sub") {
            cc.doAttrib(state, "subscript");
          }
          if (tname == "a" && dom.nodeAttr(node, "href")) {
            state.link = dom.nodeAttr(node, "href");
            _recalcAttribString(state);
          }
          if (tname == "ul" || tname == "ol") {

            var lang = cls &&  /(?:^| )lang-(([a-z]+))\b/.exec(cls);
            if (lang && lang[1]) {
              state.lang = lang[1];
            }

            var type;
            var rr = cls &&  /(?:^| )list-(([a-z]+)[12345678]?)\b/.exec(cls);
            type = rr && rr[1] || "bullet" +
                String(Math.min(_MAX_LIST_LEVEL, (state.listNesting||0)+1));
            var start = dom.nodeAttr(node, "start");
            if (nestedGutters > 1 && type.indexOf("indent") > -1 && state.listType && state.listType.indexOf("indent") == -1) {
              // ignore indent level when pasting full line into an existing bullet list
            } else {
              oldListTypeOrNull = (_enterList(state, type, start) || 'none');
            }

            if (rr && rr[1].indexOf("code") > -1 ) {
              // enter pre-mode when content-collecting code
              if (!isPre) {
                isPre = true;
                cc.incrementFlag(state, 'preMode');
              }
            }
          }
          if ((tname == "div" || tname == "p") && cls && /gutter/.exec(cls)) {
            nestedGutters = nestedGutters+1;
          }
          if ((tname == "div" || tname == "p") && cls &&
              cls.match(/(?:^| )ace-line\b/)) {
            // disabling to improve indent line pasting
            //oldListTypeOrNull = (_enterList(state, type) || 'none');
          }
          if (state.table && (tname == "td" || tname == "th")) {
            state.columnId++;
          }

          // if (className2Author && cls && tname  !="div") {
          if (className2Author && cls) {
            var classes = cls.match(/\S+/g);
            if (classes && classes.length > 0) {
              for(var i=0;i<classes.length;i++) {
                var c = classes[i];
                var a = className2Author(c);
                if (a) {
                  oldAuthorOrNull = (_enterAuthor(state, a) || 'none');
                  break;
                }
              }
            }
          }
        }

        if (collectChildren) {
          var nc = dom.nodeNumChildren(node);
          var tname = (dom.nodeTagName(node) || "").toLowerCase();
          // for now we just drop nested tables, in the future we could
          // flatten them
          if (tname == "table" && state.table) {
            collectChildren = false;
          } else {
            if (tname == "table" && node) {
              // we should really just count tds
              state.table = [];
              state.rowId = -1;
            }
            if (tname == "tr") {
              state.rowId++;
              state.columnId = -1;
            }
          }

          if (collectChildren) {
            for(var i=0;i<nc;i++) {
              var c = dom.nodeChild(node, i);
              cc.collectContent(c, state);
            }

            // exit table
            if (state.table && tname == "table") {
              _recalcAttribString(state)
              lines.appendText("*", state.attribString);
              state.table = null;
              _recalcAttribString(state);
            }
          }
        }


        // exit link
        if (state.link) {
          state.link = null;
          _recalcAttribString(state);
        }

        if (isPre) cc.decrementFlag(state, 'preMode');
        if (state.localAttribs) {
          for(var i=0;i<state.localAttribs.length;i++) {
            cc.decrementAttrib(state, state.localAttribs[i]);
          }
        }
        if (oldListTypeOrNull) {
          _exitList(state, oldListTypeOrNull);
        }
        if (oldAuthorOrNull) {
          _exitAuthor(state, oldAuthorOrNull);
        }
        if (oldSavedFontAttribs) {
          _exitNormal(state, oldSavedFontAttribs);
        }

        // exit mso content collection
        state.MsoNormal = false;
      }
    }
    _reachBlockPoint(node, 1, state);
    if (isBlock) {
      if (lines.length()-1 == startLine) {
        cc.startNewLine(state);
      }
      else {
        _ensureColumnZero(state);
      }
    }

    state.localAttribs = localAttribs;
  };
  // can pass a falsy value for end of doc
  cc.notifyNextNode = function (node) {
    // an "empty block" won't end a line; this addresses an issue in IE with
    // typing into a blank line at the end of the document.  typed text
    // goes into the body, and the empty line div still looks clean.
    // it is incorporated as dirty by the rule that a dirty region has
    // to end a line.
    if ((!node) || (isBlockElement(node) && !_isEmpty(node))) {
      _ensureColumnZero(null);
    }
  };
  // each returns [line, char] or [-1,-1]
  var getSelectionStart = function() { return selStart; };
  var getSelectionEnd = function() { return selEnd; };

  // returns array of strings for lines found, last entry will be "" if
  // last line is complete (i.e. if a following span should be on a new line).
  // can be called at any point
  cc.getLines = function() { return lines.textLines(); };

  cc.finish = function() {
    lines.flush();
    var lineAttribs = lines.attribLines();
    var lineStrings = cc.getLines();

    lineStrings.length--;
    lineAttribs.length--;

    var ss = getSelectionStart();
    var se = getSelectionEnd();

    function fixLongLines() {
      // design mode does not deal with with really long lines!
      var lineLimit = 2000; // chars
      var buffer = 10; // chars allowed over before wrapping
      var linesWrapped = 0;
      var numLinesAfter = 0;
      for(var i=lineStrings.length-1; i>=0; i--) {
        var oldString = lineStrings[i];
        var oldAttribString = lineAttribs[i];
        if (oldString.length > lineLimit+buffer) {
          var newStrings = [];
          var newAttribStrings = [];
          while (oldString.length > lineLimit) {
            //var semiloc = oldString.lastIndexOf(';', lineLimit-1);
            //var lengthToTake = (semiloc >= 0 ? (semiloc+1) : lineLimit);
            lengthToTake = lineLimit;
            newStrings.push(oldString.substring(0, lengthToTake));
            oldString = oldString.substring(lengthToTake);
            newAttribStrings.push(Changeset.subattribution(oldAttribString,
                                  0, lengthToTake));
            oldAttribString = Changeset.subattribution(oldAttribString,
                                                       lengthToTake);
          }
          if (oldString.length > 0) {
            newStrings.push(oldString);
            newAttribStrings.push(oldAttribString);
          }
          function fixLineNumber(lineChar) {
            if (lineChar[0] < 0) return;
            var n = lineChar[0];
            var c = lineChar[1];
            if (n > i) {
              n += (newStrings.length-1);
            }
            else if (n == i) {
              var a = 0;
              while (c > newStrings[a].length) {
                c -= newStrings[a].length;
                a++;
              }
              n += a;
            }
            lineChar[0] = n;
            lineChar[1] = c;
          }
          fixLineNumber(ss);
          fixLineNumber(se);
          linesWrapped++;
          numLinesAfter += newStrings.length;

          newStrings.unshift(i, 1);
          lineStrings.splice.apply(lineStrings, newStrings);
          newAttribStrings.unshift(i, 1);
          lineAttribs.splice.apply(lineAttribs, newAttribStrings);
        }
      }
      return {linesWrapped:linesWrapped, numLinesAfter:numLinesAfter};
    }
    var wrapData = fixLongLines();

    return { selStart: ss, selEnd: se, linesWrapped: wrapData.linesWrapped,
             numLinesAfter: wrapData.numLinesAfter,
             lines: lineStrings, lineAttribs: lineAttribs, newAuthors: newAuthors, nestedDomLines: nestedDomLines};
  }

  return cc;
}
