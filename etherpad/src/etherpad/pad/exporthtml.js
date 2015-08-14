/**
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

import("etherpad.importexport.table.renderStaticTable");
import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.log");
import("etherpad.utils");
jimport("org.apache.commons.lang.StringEscapeUtils.unescapeHtml");

function getPadPlainText(pad, revNum, optSkipTitle) {
  var atext = ((revNum !== undefined) ? pad.getInternalRevisionAText(revNum) :
               pad.atext());
  var textLines = atext.text.slice(0,-1).split('\n');
  var attribLines = Changeset.splitAttributionLines(atext.attribs, atext.text);
  var apool = pad.pool();

  var pieces = [];
  for(var i=0;i<textLines.length;i++) {
    var line = _analyzeLine(textLines[i], attribLines[i], apool);
    if (line.listLevel) {
      var numSpaces = line.listLevel*2-1;
      var bullet = '*';
      pieces.push(new Array(numSpaces+1).join(' '), bullet, ' ', line.text, '\n');
    }
    else {
      pieces.push(line.text, '\n');
    }
  }
  if (optSkipTitle) {
    pieces = pieces.slice(1);
  }
  return pieces.join('');
}

function _currentListLiteral (lists, closing) {
  var currentListName = lists[lists.length-1][1];

  if (currentListName == "bullet") {
    return "ul";
  }
  if (currentListName == "number") {
    return "ol";
  }
  if (currentListName == "task") {
    return "ul" + (closing ?  "" : ' class=\"task\"') ;
  }
  if (currentListName == "taskdone") {
    return "ul" + (closing ?  "" : ' class=\"taskdone\"') ;
  }
  if (currentListName == "comment") {
    return "ul" + (closing ?  "" : ' class=\"comment\"') ;
  }
  if (currentListName == "code") {
    return "ul" + (closing ?  "" : ' class=\"code\"') ;
  }
  if (currentListName == "indent") {
    return "ul" + (closing ?  "" : ' style=\"list-style: none;\"') ;
  }
}


function getPadHTML(pad, revNum, removeTitleLine, unescapeCodeFragment, absoluteURLs) {
  var atext = ((revNum !== undefined) ? pad.getInternalRevisionAText(revNum) :
               pad.atext());
  var textLines = atext.text.slice(0,-1).split('\n');
  var attribLines = Changeset.splitAttributionLines(atext.attribs, atext.text);

  var apool = pad.pool();

  var tags = ['b','i','u','s','sup','sub',];
  var props = ['bold','italic','underline','strikethrough','superscript','subscript'];
  var anumMap = {};
  props.forEach(function(propName, i) {
    var propTrueNum = apool.putAttrib([propName,true], true);
    if (propTrueNum >= 0) {
      anumMap[propTrueNum] = i;
    }
  });

  function getLineHTML(text, attribs, listTypeName) {
    var propVals = [false, false, false];
    var ENTER = 1;
    var STAY = 2;
    var LEAVE = 0;

    // Use order of tags (b/i/u) as order of nesting, for simplicity
    // and decent nesting.  For example,
    // <b>Just bold<b> <b><i>Bold and italics</i></b> <i>Just italics</i>
    // becomes
    // <b>Just bold <i>Bold and italics</i></b> <i>Just italics</i>

    var taker = Changeset.stringIterator(text);
    var assem = Changeset.stringAssembler();

    function emitOpenTag(i) {
      assem.append('<');
      assem.append(tags[i]);
      assem.append('>');
    }
    function emitCloseTag(i) {
      assem.append('</');
      assem.append(tags[i]);
      assem.append('>');
    }

    var urls = _findURLs(text);

    var idx = 0;
    function processNextChars(numChars) {
      if (numChars <= 0) {
        return;
      }

      var iter = Changeset.opIterator(Changeset.subattribution(attribs,
        idx, idx+numChars));
      idx += numChars;

      while (iter.hasNext()) {
        var o = iter.next();
        var propChanged = false;
        var linkUrl = null;
        Changeset.eachAttribNumber(o.attribs, function(a) {
          if (a in anumMap) {
            var i = anumMap[a]; // i = 0 => bold, etc.
            if (! propVals[i]) {
              propVals[i] = ENTER;
              propChanged = true;
            }
            else {
              propVals[i] = STAY;
            }
          }

          if(apool.getAttribKey(a) == 'link') {
            linkUrl = apool.getAttribValue(a);
            // make relative URLs absolute if requested
            if (absoluteURLs && linkUrl[0] == "/") {
              linkUrl = utils.absoluteURL(linkUrl);
            }
          }
        });
        for(var i=0;i<propVals.length;i++) {
          if (propVals[i] === true) {
            propVals[i] = LEAVE;
            propChanged = true;
          }
          else if (propVals[i] === STAY) {
            propVals[i] = true; // set it back
          }
        }
        // now each member of propVal is in {false,LEAVE,ENTER,true}
        // according to what happens at start of span

        if (propChanged) {
          // leaving bold (e.g.) also leaves italics, etc.
          var left = false;
          for(var i=0;i<propVals.length;i++) {
            var v = propVals[i];
            if (! left) {
              if (v === LEAVE) {
                left = true;
              }
            }
            else {
              if (v === true) {
                propVals[i] = STAY; // tag will be closed and re-opened
              }
            }
          }

          for(var i=propVals.length-1; i>=0; i--) {
            if (propVals[i] === LEAVE) {
              emitCloseTag(i);
              propVals[i] = false;
            }
            else if (propVals[i] === STAY) {
              emitCloseTag(i);
            }
          }
          for(var i=0; i<propVals.length; i++) {
            if (propVals[i] === ENTER || propVals[i] === STAY) {
              emitOpenTag(i);
              propVals[i] = true;
            }
          }
          // propVals is now all {true,false} again
        } // end if (propChanged)

        var chars = o.chars;
        if (o.lines) {
          chars--; // exclude newline at end of line, if present
        }
        var s = taker.take(chars);

        // handle images
        var handledSpecial = false;
        if (s=="*") {
          Changeset.eachAttribNumber(o.attribs, function(n) {
            var key = apool.getAttribKey(n);
            if (key) {
              var value = apool.getAttribValue(n);
              if (value) {
                if (key == "img") {
                  assem.append("<img src='"+_escapeHTML(value)+"'/>");
                  handledSpecial = true;
                }
              }
            }
          });
        }

        // output links
        if (linkUrl && !(listTypeName=="code" && unescapeCodeFragment)) {
          assem.append("<a href='"+_escapeHTML(linkUrl)+"'/>" + _escapeHTML(s) + '</a>');
          handledSpecial = true;
        }

        if (!handledSpecial) {
          assem.append(_escapeHTML(s));
        }
      } // end iteration over spans in line

      for(var i=propVals.length-1; i>=0; i--) {
        if (propVals[i]) {
          emitCloseTag(i);
          propVals[i] = false;
        }
      }
    } // end processNextChars

    if (urls) {

      urls.forEach(function(urlData) {
        var startIndex = urlData[0];
        var url = urlData[1];
        var urlLength = url.length;
        processNextChars(startIndex - idx);
        if (listTypeName=="code" && unescapeCodeFragment) {

        } else {
          assem.append('<a href="'+url.replace(/\"/g, '&quot;')+'">');
          assem.append('</a>');
        }
        processNextChars(urlLength);
      });
    }
    processNextChars(text.length - idx);

    return _processSpaces(assem.toString());
  } // end getLineHTML

  function _popAllLists(lists) {
    // non-blank line, end all lists
    for (var j=lists.length-1; j>=0 ;j--){
      var listLiteral = _currentListLiteral(lists);
      lists.length--;
      pieces.push('</li></'+listLiteral+'>\n');
    }
    lists.length = 0;
  }

  var pieces = [];

  // Need to deal with constraints imposed on HTML lists; can
  // only gain one level of nesting at once, can't change type
  // mid-list, etc.
  // People might use weird indenting, e.g. skip a level,
  // so we want to do something reasonable there.  We also
  // want to deal gracefully with blank lines.
  var lists = []; // e.g. [[1,'bullet'], [3,'bullet'], ...]

  for(var i=removeTitleLine ? 1 : 0; i<textLines.length; i++) {
    var line = _analyzeLine(textLines[i], attribLines[i], apool);

    // render tables
    var node = renderStaticTable(attribLines[i], apool);
    if (node) {
      pieces.push(node.innerHTML);
      continue;
    }

    var lineContent = getLineHTML(line.text, line.aline, line.listTypeName);
    if (line.listTypeName == "hone") {
      // todo pop all lists
      _popAllLists(lists);
      pieces.push('<h2>'+line.text + '</h2>');
      continue;
    }
    if (line.listTypeName == "htwo") {
      // todo pop all lists
      _popAllLists(lists);
      pieces.push('<h3>'+line.text + '</h3>');
      continue;
    }

    if (line.listLevel || lists.length > 0) {
      // do list stuff
      var whichList = -1; // index into lists or -1
      if (line.listLevel) {
        whichList = lists.length;
        for(var j=lists.length-1;j>=0;j--) {
          if (line.listLevel <= lists[j][0]) {
            whichList = j;
          }
        }
      }
      var currentListTypeName = lists.length ? lists[lists.length-1][1] : null;

      if (currentListTypeName && (currentListTypeName != line.listTypeName)) {
        // exit lists to the line.listLevel -1 level
        pieces.push('</li>');

        while (lists.length > 0 && (line.listLevel <= lists.length)) {
          var listLiteral = _currentListLiteral(lists, true);
          pieces.push('</'+listLiteral+'>\n');
          lists.length--;
        }

      }
      if (whichList >= lists.length) {
        // we are entering a new list
        lists.push([line.listLevel, line.listTypeName]);
        var listLiteral = _currentListLiteral(lists);

        var newListName = lists[lists.length-1][1];
        if (newListName == "code" && unescapeCodeFragment) {
          pieces.push(unescapeHtml(lineContent) || '<br/>');
        } else {
          pieces.push('<'+listLiteral+'><li>', lineContent || '<br/>');
        }
      }
      else if (whichList == -1) {
        // we are exiting all lists
        if (line.text) {
          // non-blank line, end all lists
          _popAllLists(lists);
          pieces.push("<p>", lineContent, '</p>');
        }
        else {
          pieces.push('\n');
        }

      }
      else {
        // we are exiting one list
        while (whichList < lists.length-1) {
          _currentListLiteral(lists, true);
          pieces.push('</li></'+listLiteral+'>\n');
          lists.length--;
        }

        var newListName = lists[lists.length-1][1];
        if (newListName == "code" && unescapeCodeFragment) {
          pieces.push(unescapeHtml(lineContent) || '<br/>');
        } else {
          pieces.push('</li>\n<li>', lineContent || '<br/>');
        }
      }
    }
    else {
      if (i==0) {
        pieces.push("<h1>", lineContent, "</h1>");
      } else if (removeTitleLine && i == 1 && lineContent == "") {
        // don't start with an empty line
      } else {
        pieces.push("<p>", lineContent, '</p>');
      }
    }
  }
  pieces.push(new Array(lists.length+1).join('</li></ul>\n'));

  return pieces.join('');
}

/*
  Returns a line object with
  {text:, aline:, listTypeName:, listLevel:}
  The text and aline will now exclude the lineMarker
*/
function _analyzeLine(text, aline, apool) {
  var line = {};

  // identify list
  var lineMarker = 0;
  line.listLevel = 0;
  if (aline) {
    var opIter = Changeset.opIterator(aline);
    if (opIter.hasNext()) {
      var listType = Changeset.opAttributeValue(opIter.next(), 'list', apool);
      if (listType) {
        lineMarker = 1;
        listType = /([a-z]+)([12345678])/.exec(listType);
        if (listType) {
          line.listTypeName = listType[1];
          line.listLevel = Number(listType[2]);
        }
      }
    }
  }
  if (lineMarker) {
    line.text = text.substring(1);
    line.aline = Changeset.subattribution(aline, 1);
  }
  else {
    line.text = text;
    line.aline = aline;
  }

  return line;
}

function getPadHTMLDocument(pad, revNum, noDocType, removeTitleLine, unescapeCodeFragment) {
  var head = (noDocType?'':'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" '+
              '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n')+
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">\n'+
    (noDocType?'':
      '<head>\n'+
      '<meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n'+
      '<meta http-equiv="Content-Language" content="en-us" />\n'+
      '<meta name="version" content="'+ revNum +'"/>\n'+
      '<style>' +
      'body {font-family:Helvetica}' +
      'ul.comment{list-style-image:url(\''+ 'https://hackpad.com/static/img/comment.png' +'\');} '+
      'ul.task{list-style-image:url(\''+ 'https://hackpad.com/static/img/unchecked.png' +'\');}'+
      'ul.taskdone{list-style-image:url(\''+ 'https://hackpad.com/static/img/checked.png' +'\');} '+
      '</style>'+
      '<title>'+'/'+pad.getId()+'</title>\n'+
      '</head>\n')+
    '<body>';

  var foot = '</body>\n</html>\n';

  return head + getPadHTML(pad, revNum, removeTitleLine, unescapeCodeFragment) + foot;
}

function _escapeHTML(s) {
  var re = /[&<>'"\\\n\r]/g;
  if (! re.MAP) {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&rsquo;',
      '\\': '&#92;',
      '\n': '&#10;',
      '\r': '&#13;'
    };
  }
  return s.replace(re, function(c) { return re.MAP[c]; });
}

// copied from ACE
function _processSpaces(s) {
  var doesWrap = true;
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
}


// copied from ACE
var _REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
var _REGEX_SPACE = /\s/;
var _REGEX_URLCHAR = new RegExp('('+/[-:@a-zA-Z0-9_.,~%+\/\\?=&#;()$]/.source+'|'+_REGEX_WORDCHAR.source+')');
var _REGEX_URL = new RegExp(/(?:(?:https?|sftp|ftps?|ssh|ircs?|file|gopher|telnet|nntp|worldwind|chrome|chrome-extension|svn|git|mms|smb|afp|nfs|(x-)?man|gopher|txmt):\/\/|mailto:|xmpp:|sips?:|tel:|sms:|news:|bitcoin:|magnet:|urn:|geo:)/.source+_REGEX_URLCHAR.source+'*(?![:.,;])'+_REGEX_URLCHAR.source, 'g');

// returns null if no URLs, or [[startIndex1, url1], [startIndex2, url2], ...]
function _findURLs(text) {
  _REGEX_URL.lastIndex = 0;
  var urls = null;
  var execResult;
  while ((execResult = _REGEX_URL.exec(text))) {
    urls = (urls || []);
    var startIndex = execResult.index;
    var url = execResult[0];
    urls.push([startIndex, url]);
  }

  return urls;
}
