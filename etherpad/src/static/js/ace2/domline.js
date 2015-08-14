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

// requires: top
// requires: undefined

// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.domline

function _htmlEscaped(v) {
  return String(v).replace(/\"/g, '&quot;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/&/g, '&amp;');
}

var domline = {};
domline.noop = function() {};
domline.identity = function(x) { return x; };
domline.embedhtml = {};
domline.hashCode = function(str) {
  var hash = 0;
  if (str.length == 0) return hash;
  for (i = 0; i < str.length; i++) {
    var chr = str.charCodeAt(i);
    hash = ((hash<<5)-hash)+chr;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

domline.addToLineClass = function(lineClass, cls) {
  // an "empty span" at any point can be used to add classes to
  // the line, using line:className.  otherwise, we ignore
  // the span.
  cls.replace(/\S+/g, function (c) {
    if (c.indexOf("line:") == 0) {
      // add class to line
      lineClass = (lineClass ? lineClass+' ' : '')+c.substring(5);
    }
  });
  return lineClass;
}

domline.addTable = function (id, optDocument) {
  if (!optDocument) {
    // if rendering staticly, don't point to the iframe
    // this is sort of buggy, but prevents a double pop
    return "<span class='inline-table'><div style='' contenteditable='false'></div></span>";
  } else {
    return "<span class='inline-table'><div style='' contenteditable='false'><iframe id='sheet-id' src='/ep/sheet' width='100%' height='50px' style='border:0px' scrolling='no'></iframe></div></span>";
  }
}

domline.addSurrogate = function(src, cls, optDocument, surrogateCb,
    optRichContentOnloadFunc) {
  var hash = domline.hashCode(src);
  content = '<span class="inline-' + cls + '" ' + cls + '="' + _htmlEscaped(src) + '"><div contenteditable="false" class="embed-' + hash + '">';

  var embedcode = domline.embedhtml[hash];
  if (embedcode) {
    content += embedcode;
    //console.log("havembed=" + domline.embedhtml[hash]);
  } else {
    content += '<img class="inline-img" src="/static/img/pixel.gif" contenteditable="false">';
  }

  // FIXME: needs trailing space to avoid inserting two embeds (on Chrome)
  content += "</div></span>";

  if (embedcode == undefined) {
    domline.embedhtml[hash] = false; // avoid multiple embed requests
    surrogateCb(src, function(html) {
      html = html || "";
      //console.log("optEmbed-callback=" + html);
      domline.embedhtml[hash] = html;
      var nodes = optDocument.querySelectorAll('.embed-' + hash);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        //console.log("n=" + n);
        n.innerHTML = html;
        //console.log("innerHtml=" + n.innerHTML);
        if (document && optRichContentOnloadFunc) {
          var richNodes = n.querySelectorAll('img, iframe');
          for (var x = 0; x < richNodes.length; ++x) {
            if (richNodes[x].addEventListener) {
              richNodes[x].addEventListener('load', optRichContentOnloadFunc,
                  false);
            } else {
              richNodes[x].attachEvent('onload', optRichContentOnloadFunc);
            }
          }
        }
      }
    });
  }

  return content;
}

var validUrlRe = new RegExp('^(?:https?|sftp|ftps?|ssh|ircs?|file|gopher|telnet|nntp|worldwind|chrome|chrome-extension|svn|git|mms|smb|afp|nfs|(x-)?man|gopher|txmt|x-hackpad-image-upload)://|^mailto:|^xmpp:|^sips?:|^tel:|^sms:|^news:|^bitcoin:|^magnet:|^urn:|^geo:|^/', 'i');

// if "document" is falsy we don't create a DOM node, just
// an object with innerHTML and className
domline.createDomLine = function(nonEmpty, doesWrap, optBrowser, optDocument,
    optRelativeUrlPrefix, optEmbed, optMath, optForEmail,
    optRichContentOnloadFunc, opt_authorInfos) {
  var result = { node: null,
                 appendSpan: domline.noop,
                 prepareForAdd: domline.noop,
                 notifyAdded: domline.noop,
                 clearSpans: domline.noop,
                 finishUpdate: domline.noop,
                 lineMarker: 0 };

  var browser = (optBrowser || {});
  var document = optDocument;

  if (document) {
    result.node = document.createElement("div");
  }
  else {
    result.node = {innerHTML: '', className: ''};
  }

  var html = [];
  var preHtml, postHtml;
  var curHTML = null;
  function processSpaces(s) {
    return domline.processSpaces(s, doesWrap);
  }
  var identity = domline.identity;
  var perTextNodeProcess = (doesWrap ? identity : processSpaces);
  var perHtmlLineProcess = (doesWrap ? processSpaces : identity);
  var lineClass = 'ace-line';
  var nonEmptyAttr = false;
  var richContentOnloadFunc = null;

  result.appendSpan = function(txt, cls, classToStyle) {
    // list markers are special, they just move the start of the line
    if (cls.indexOf('list') >= 0) {
      var listType = /(?:^| )list:(\S+)/.exec(cls);
      var lang = /(?:^| )lang:(\S+)/.exec(cls);
      if (lang) {
        lang = lang[1];
      }
      var start = /(?:^| )start:(\S+)/.exec(cls);

      if (listType) {
        listType = listType[1];
        start = start?'start="'+start[1]+'"':'';
        if (listType) {
          var listTypes = /(\D+)(\d+)/.exec(listType);
          var baseListType = listTypes[1];
          var listIndent = listTypes[2];
          var olNUM = 0;
          // wrap the entire line in a <ul><li>
          if (optBrowser == "email") {
            if (listType.indexOf("indent") > -1) {
              var indentLevel = parseInt(listType.substring("indent".length))
              var leftMargin = indentLevel * 1.5;
              preHtml = '<ul class="listtype-' + baseListType +
                  ' listindent' + listIndent +
                  ' list-'+listType+'" style="list-style-type: none; margin: 0 0 0 ' + leftMargin + 'em"><li>';
            }

            if (listType.indexOf("taskdone") > -1) {
              preHtml = '<ul class="listtype-' + baseListType +
                  ' listindent' + listIndent +
                  ' list-'+listType+'" style="list-style-type: none; margin: 0"><li><input type="checkbox" checked disabled>&nbsp;';
            } else if (listType.indexOf("task") > -1) {
              preHtml = '<ul class="listtype-' + baseListType +
                  ' listindent' + listIndent +
                  ' list-'+listType+'" style="list-style-type: none; margin: 0"><li><input type="checkbox" disabled>&nbsp;';
            }
          } else {

            if(listType.indexOf("number") < 0)
            {
              preHtml = '<ul class="listtype-' + baseListType +
                  ' listindent' + listIndent +
                  ' list-' + listType + (lang ? ' lang-'+lang : "") + '" ' + (lang ? 'spellcheck="false"' : '') + '><li>';
              postHtml = '</li></ul>';
            }
            else
            {
              preHtml = '<ol '+start+' class="listtype-' + baseListType +
                  ' listindent' + listIndent + ' list-' + listType + '"><li>';
              postHtml = '</li></ol>';
            }

          }
        }
        result.lineMarker += txt.length;
        return; // don't append any text
      }
    }

    var href = null;
    var hrefClassAttr = "";
    if (cls.indexOf('url') >= 0) {
      // extract the href for the span
      cls = cls.replace(/(^| )url:(\S+)/g, function(x0, space, url) {
        try {
          href = decodeURIComponent(url);
        } catch(ex) {
          href = url;
        }
        return space+"url";
      });
      // move the attrlink class from the span to the <a> we'll wrap around it
      // todo: why did i decide to not put the a inside?
      if (cls.indexOf('attrlink') >= 0) {
        hrefClassAttr = ' class="attrlink"';
      }
    }

    var imgSrc = null;
    if (cls.indexOf('img') >= 0) {
      cls = cls.replace(/(^| )img:(\S+)/g, function(x0, space, url) {
        imgSrc = decodeURIComponent(url);
        return space+"img";
      });
    }

    var emojiCode = null;
    if (cls.indexOf('emoji-code') >= 0) {
      cls = cls.replace(/(^| )emoji-code:(\S+)/g, function(x0, space, url) {
        emojiCode = decodeURIComponent(url).replace(/:/g, '');
        return space+'emoji';
      });
    }

    var emoji = null;
    if (cls.indexOf('emoji') >= 0) {
      cls = cls.replace(/(^| )emoji:(\S+)/g, function(x0, space, url) {
        emoji = decodeURIComponent(url).replace(/:/g, '');
        return space+'emoji';
      });
    }

    var embedSrc = null;
    if (cls.indexOf('embed') >= 0) {
      cls = cls.replace(/(^| )embed:(\S+)/g, function(x0, space, url) {
        embedSrc = decodeURIComponent(url);
        return space+"embed";
      });
    }
    var tableId = null;
    if (cls.indexOf('table') >= 0) {
      cls = cls.replace(/(^| )table:(\S+)/g, function(x0, space, id) {
        tableId = id;
        return space+"table";
      });
    }

    var texSrc = null;
    if (cls.indexOf('tex') >= 0) {
      cls = cls.replace(/(^| )tex:(\S+)/g, function(x0, space, url) {
        texSrc = decodeURIComponent(url);
        return space+"tex";
      });
    }

    if (cls.indexOf('hashtag') >= 0) {
      cls = cls.replace(/(^| )hashtag:(\S+)/g, function(x0, space, tag) {
        href = "/ep/search/?q="+tag;
        if (typeof clientVars === "object" && clientVars.padId) {
          href += "&via=" + clientVars.padId;
        }
        return space+"hashtag url internal";
      });
    }

    var simpleTags = null;
    if (cls.indexOf('tag') >= 0 && !tableId) {    /* don't wrap tables in extra tags */
      cls = cls.replace(/(^| )tag:(\S+)/g, function(x0, space, tag) {
        if (! simpleTags) simpleTags = [];
          simpleTags.push(tag.toLowerCase());
          return space+tag;
      });
    }

    var extraOpenTags = "";
    var extraCloseTags = "";

    if ((! txt) && cls) {
      lineClass = domline.addToLineClass(lineClass, cls);
    }
    else if (txt) {
      if (href) {
        if (optRelativeUrlPrefix && href.indexOf("/") == 0) {
          href = optRelativeUrlPrefix + href;
        }

        if (!validUrlRe.test(href)) {
          href = '';
        }
        extraOpenTags = extraOpenTags+'<a'+hrefClassAttr+' href="'+
          _htmlEscaped(href) + '">';
        extraCloseTags = '</a>'+extraCloseTags;
      }
      if (simpleTags) {
        simpleTags.sort();
        extraOpenTags = extraOpenTags+'<'+simpleTags.join('><')+'>';
        simpleTags.reverse();
        extraCloseTags = '</'+simpleTags.join('></')+'>'+extraCloseTags;
      }

      // we're given a function to convert classes to styles, do it
      // this is used for html email as it only allows inline styles
      var style = "";
      if (classToStyle) {
        style = " style='" + classToStyle(cls) + "'";
      }
      var content = null;
      var nodeValue = "";
      if (imgSrc) {
        if (!validUrlRe.test(imgSrc)) {
          imgSrc = '';
        }

        // the img maxwidth/height
        var imgStyle = optForEmail ? 'style="max-width:100%; max-height:auto;" ':"";
        content = '<img ' + imgStyle + 'class="inline-img" src="' +
            _htmlEscaped(imgSrc) + '" faketext="*" contenteditable="false">' +
            '<div class="remove-media" contenteditable="false"></div>';
        nodeValue = " nodeValue='*'";
        richContentOnloadFunc = optRichContentOnloadFunc;
      } else if (emojiCode) {
        var cdn = '';
        if (typeof clientVars === "object" && clientVars.cdn) {
          cdn = clientVars.cdn;
        }
        var extraChar = emojiCode.split('_')[2] ? '_' + emojiCode.split('_')[2] : '';
        var emojiLeafName = emojiCode.split('_')[1] + extraChar;
        emojiLeafName = emojiLeafName.replace('fe0f', '').replace('_', '-');
        content = '<span class="emoji-glyph" title=":' + emojiCode + ':" style="' +
            'background-image:url(' + cdn + '/static/img/emoji/unicode/' +
            emojiLeafName + '.png)">:' + emojiCode + ':</span><span></span>';
      } else if (emoji) {
        var cdn = '';
        if (typeof clientVars === "object" && clientVars.cdn) {
          cdn = clientVars.cdn;
        }
        content = '<span class="emoji-glyph" title=":' + emoji + ':" style="' +
            'background-image:url(' + cdn + '/static/img/emoji/' +
            emoji + '.png)">:' + emoji +':</span><span></span>';
      } else if (embedSrc && optEmbed) {
        // tell outer to replace this element's content with the result from embedly
        if (optBrowser == "email" || optBrowser == "stream") {
          content = optEmbed(embedSrc);
        } else {
          content = domline.addSurrogate(embedSrc, "embed", optDocument,
              optEmbed, optRichContentOnloadFunc);
        }
      } else if (tableId) {
        content = domline.addTable(tableId, optDocument);
        richContentOnloadFunc = optRichContentOnloadFunc;
      } else if (texSrc && optMath) {
        content = domline.addSurrogate(texSrc, "tex", optDocument, optMath,
            optRichContentOnloadFunc);
      } else {
        content = perTextNodeProcess(domline.escapeHTML(txt))
      }

      // add a ZEROWIDTH_SPACE span right after the attribute name
      if (lineClass.indexOf("aCol") > -1 &&
          (cls.indexOf("colname") == -1 && !nonEmptyAttr)) {
        nonEmptyAttr = true;
        html.push('<span>',"&#8203;",'</span>');
      }

      html.push('<span', style ,' class="',cls||'','">',extraOpenTags,
        content, extraCloseTags,'</span>');

    }
  };
  result.clearSpans = function() {
    html = [];
    lineClass = 'ace-line';
    nonEmptyAttr = false;
    result.lineMarker = 0;
  };
  function writeHTML() {
    // add the requisite ZEROWIDTH_SPACE
    if (lineClass.indexOf("aCol") > -1 && !nonEmptyAttr) {
      html.push('<span>', "&#8203;",'</span>');
    }

    var newHTML = perHtmlLineProcess(html.join(''));
    if (! newHTML) {
      if ((! document) || (! optBrowser)) {
        newHTML += '&nbsp;';
      }
      else if (! browser.msie) {
        newHTML += '<br/>';
      }
    }
    if (nonEmpty) {
      newHTML = (preHtml||'')+newHTML+(postHtml||'');
    }
    html = preHtml = postHtml = null; // free memory
    if (newHTML !== curHTML) {
      curHTML = newHTML;
      result.node.innerHTML = curHTML;
      if (document && richContentOnloadFunc) {
        var richNodes = result.node.querySelectorAll('img, iframe');
        for (var x = 0; x < richNodes.length; ++x) {
          if (richNodes[x].addEventListener) {
            richNodes[x].addEventListener('load', richContentOnloadFunc,
                false);
          } else {
            richNodes[x].attachEvent('onload', richContentOnloadFunc);
          }
        }
      }
    }
    if (lineClass !== null) {
      if (opt_authorInfos) {
        function _shortName(name) {
          if (!name) {
            return '';
          }

          var parts = name.split(" ");
          if (parts.length >= 2) {
            // initials
            return parts[0].substr(0,1) + parts[parts.length - 1].substr(0, 1);
          } else {
            // first char only
            return name.substr(0,1);
          }
        }

        function _getName(name) {
          if (!name) {
            return '';
          }

          var parts = name.split(" ");
          return parts.length >= 2 ?
              parts[0] + " " + parts[parts.length - 1].substr(0, 1) :
              name;
        }

        var authorClasses = lineClass.split(' ').filter(
            function(i) { return i.match("^gutter-author-|^author-") });
        if (authorClasses) {
          var authors = map(authorClasses, linestylefilter.className2Author);
          if (authors.length) {
            var authorInfo = opt_authorInfos[authors[0]];
            if (authorInfo) {
              result.node.setAttribute('data-author-initials',
                  _shortName(authorInfo.name));
              result.node.setAttribute('data-author-name',
                  _getName(authorInfo.name));
              result.node.setAttribute('data-author-link',
                  authorInfo.userLink || '');
            }
          }
        }
      }

      result.node.className = lineClass;
    }
  }
  result.prepareForAdd = writeHTML;
  result.finishUpdate = writeHTML;
  result.getInnerHTML = function() { return curHTML || ''; };

  return result;
};

domline.escapeHTML = function(s) {
  var re = /[&<>'"]/g; /']/; // stupid indentation thing
  if (! re.MAP) {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&#34;',
      "'": '&#39;'
    };
  }
  return s.replace(re, function(c) { return re.MAP[c]; });
};

domline.processSpaces = function(s, doesWrap) {
  if (s.indexOf("<") < 0 && ! doesWrap) {
    // short-cut
    return s.replace(/ /g, '&nbsp;');
  }
  var parts = [];
  s.replace(/<[^>]*>?| |[^ <]+/g, function(m) { parts.push(m); });
  if (doesWrap) {
    var endOfLine = true;
    var beforeSpace = false;
    // last space in a run is normal, others are nbsp,
    // end of line is nbsp
    for(var i=parts.length-1;i>=0;i--) {
      var p = parts[i];
      if (p == " ") {
        if (endOfLine || beforeSpace)
          parts[i] = '&nbsp;';
        endOfLine = false;
        beforeSpace = true;
      }
      else if (p.charAt(0) != "<") {
        endOfLine = false;
        beforeSpace = false;
      }
    }
    // beginning of line is nbsp
    for(var i=0;i<parts.length;i++) {
      var p = parts[i];
      if (p == " ") {
        parts[i] = '&nbsp;';
        break;
      }
      else if (p.charAt(0) != "<") {
        break;
      }
    }
  }
  else {
    for(var i=0;i<parts.length;i++) {
      var p = parts[i];
      if (p == " ") {
        parts[i] = '&nbsp;';
      }
    }
  }
  return parts.join('');
};
