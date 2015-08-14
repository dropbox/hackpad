// THIS FILE IS ALSO AN APPJET MODULE: etherpad.collab.ace.easysync1

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

function Changeset(arg) {

  var array;
  if ((typeof arg) == "string") {
    // constant
    array = [Changeset.MAGIC, 0, arg.length, 0, 0, arg];
  }
  else if ((typeof arg) == "number") {
    var n = Math.round(arg);
    // delete-all on n-length text (useful for making a "builder")
    array = [Changeset.MAGIC, n, 0, 0, 0, ""];
  }
  else if (! arg) {
    // identity on 0-length text
    array = [Changeset.MAGIC, 0, 0, 0, 0, ""];
  }
  else if (arg.isChangeset) {
    return arg;
  }
  else array = arg;

  array.isChangeset = true;

  // OOP style: attach generic methods to array object, hold no state in environment

  //function error(msg) { top.console.error(msg); top.console.trace(); }
  function error(msg) { var e = new Error(msg); e.easysync = true; throw e; }
  function assert(b, msg) { if (! b) error("Changeset: "+String(msg)); }
  function min(x, y) { return (x < y) ? x : y; }
  Changeset._assert = assert;

  array.isIdentity = function() {
    return this.length == 6 && this[1] == this[2] && this[3] == 0 &&
      this[4] == this[1] && this[5] == "";
  }

  array.eachStrip = function(func, thisObj) {
    // inside "func", the method receiver will be "this" by default,
    // or you can pass an object.
    for(var i=0;i<this.numStrips();i++) {
      var ptr = 3 + i*3;
      if (func.call(thisObj || this, this[ptr], this[ptr+1], this[ptr+2], i))
	return true;
    }
    return false;
  }

  array.numStrips = function() { return (this.length-3)/3; };
  array.oldLen = function() { return this[1]; };
  array.newLen = function() { return this[2]; };

  array.checkRep = function() {
    assert(this[0] == Changeset.MAGIC, "bad magic");
    assert(this[1] >= 0, "bad old text length");
    assert(this[2] >= 0, "bad new text length");
    assert((this.length % 3) == 0, "bad array length");
    assert(this.length >= 6, "must be at least one strip");
    var numStrips = this.numStrips();
    var oldLen = this[1];
    var newLen = this[2];
    // iterate over the "text strips"
    var actualNewLen = 0;
    this.eachStrip(function(startIndex, numTaken, newText, i) {
      var s = startIndex, t = numTaken, n = newText;
      var isFirst = (i == 0);
      var isLast = (i == numStrips-1);
      assert(t >= 0, "can't take negative number of chars");
      assert(isFirst || t > 0, "all strips but first must take");
      assert((t > 0) || (s == 0), "if first strip doesn't take, must have 0 startIndex");
      assert(s >= 0 && s + t <= oldLen, "bad index: "+this.toString());
      assert(t > 0 || n.length > 0 || (isFirst && isLast), "empty strip must be first and only");
      if (! isLast) {
	var s2 = this[3 + i*3 + 3]; // startIndex of following strip
	var gap = s2 - (s + t);
	assert(gap >= 0, "overlapping or out-of-order strips: "+this.toString());
	assert(gap > 0 || n.length > 0, "touching strips with no added text");
      }
      actualNewLen += t + n.length;
    });
    assert(newLen == actualNewLen, "calculated new text length doesn't match");
  }

  array.applyToText = function(text) {
    assert(text.length == this.oldLen(), "mismatched apply: "+text.length+" / "+this.oldLen());
    var buf = [];
    this.eachStrip(function (s, t, n) {
      buf.push(text.substr(s, t), n);
    });
    return buf.join('');
  }

  function _makeBuilder(oldLen, supportAuthors) {
    var C = Changeset(oldLen);
    if (supportAuthors) {
      _ensureAuthors(C);
    }
    return C.builder();
  }

  function _getNumInserted(C) {
    var numChars = 0;
    C.eachStrip(function(s,t,n) {
      numChars += n.length;
    });
    return numChars;
  }

  function _ensureAuthors(C) {
    if (! C.authors) {
      C.setAuthor();
    }
    return C;
  }

  array.setAuthor = function(author) {
    var C = this;
    // authors array has even length >= 2;
    // alternates [numChars1, author1, numChars2, author2];
    // all numChars > 0 unless there is exactly one, in which
    // case it can be == 0.
    C.authors = [_getNumInserted(C), author || ''];
    return C;
  }

  array.builder = function() {
    // normal pattern is Changeset(oldLength).builder().appendOldText(...). ...
    // builder methods mutate this!
    var C = this;
    // OOP style: state in environment
    var self;
    return self = {
      appendNewText: function(str, author) {
	C[C.length-1] += str;
	C[2] += str.length;

	if (C.authors) {
	  var a = (author || '');
	  var lastAuthorPtr = C.authors.length-1;
	  var lastAuthorLengthPtr = C.authors.length-2;
	  if ((!a) || a == C.authors[lastAuthorPtr]) {
	    C.authors[lastAuthorLengthPtr] += str.length;
	  }
	  else if (0 == C.authors[lastAuthorLengthPtr]) {
	    C.authors[lastAuthorLengthPtr] = str.length;
	    C.authors[lastAuthorPtr] = (a || C.authors[lastAuthorPtr]);
	  }
	  else {
	    C.authors.push(str.length, a);
	  }
	}

	return self;
      },
      appendOldText: function(startIndex, numTaken) {
	if (numTaken == 0) return self;
	// properties of last strip...
	var s = C[C.length-3], t = C[C.length-2], n = C[C.length-1];
	if (t == 0 && n == "") {
	  // must be empty changeset, one strip that doesn't take old chars or add new ones
	  C[C.length-3] = startIndex;
	  C[C.length-2] = numTaken;
	}
	else if (n == "" && (s+t == startIndex)) {
	  C[C.length-2] += numTaken; // take more
	}
	else C.push(startIndex, numTaken, ""); // add a strip
	C[2] += numTaken;
	C.checkRep();
	return self;
      },
      toChangeset: function() { return C; }
    };
  }

  array.authorSlicer = function(outputBuilder) {
    return _makeAuthorSlicer(this, outputBuilder);
  }

  function _makeAuthorSlicer(changesetOrAuthorsIn, builderOut) {
    // "builderOut" only needs to support appendNewText
    var authors; // considered immutable
    if (changesetOrAuthorsIn.isChangeset) {
      authors = changesetOrAuthorsIn.authors;
    }
    else {
      authors = changesetOrAuthorsIn;
    }

    // OOP style: state in environment
    var authorPtr = 0;
    var charIndex = 0;
    var charWithinAuthor = 0; // 0 <= charWithinAuthor <= authors[authorPtr];  max value iff atEnd
    var atEnd = false;
    function curAuthor() { return authors[authorPtr+1]; }
    function curAuthorWidth() { return authors[authorPtr]; }
    function assertNotAtEnd() { assert(! atEnd, "_authorSlicer: can't move past end"); }
    function forwardInAuthor(numChars) {
      charWithinAuthor += numChars;
      charIndex += numChars;
    }
    function nextAuthor() {
      assertNotAtEnd();
      assert(charWithinAuthor == curAuthorWidth(), "_authorSlicer: not at author end");
      charWithinAuthor = 0;
      authorPtr += 2;
      if (authorPtr == authors.length) {
	atEnd = true;
      }
    }

    var self;
    return self = {
      skipChars: function(n) {
	assert(n >= 0, "_authorSlicer: can't skip negative n");
	if (n == 0) return;
	assertNotAtEnd();

	var leftToSkip = n;
	while (leftToSkip > 0) {
	  var leftInAuthor = curAuthorWidth() - charWithinAuthor;
	  if (leftToSkip >= leftInAuthor) {
	    forwardInAuthor(leftInAuthor);
	    leftToSkip -= leftInAuthor;
	    nextAuthor();
	  }
	  else {
	    forwardInAuthor(leftToSkip);
	    leftToSkip = 0;
	  }
	}
      },
      takeChars: function(n, text) {
	assert(n >= 0, "_authorSlicer: can't take negative n");
	if (n == 0) return;
	assertNotAtEnd();
	assert(n == text.length, "_authorSlicer: bad text length");

	var textLeft = text;
	var leftToTake = n;
	while (leftToTake > 0) {
	  if (curAuthorWidth() > 0 && charWithinAuthor < curAuthorWidth()) {
	    // at least one char to take from current author
	    var leftInAuthor = (curAuthorWidth() - charWithinAuthor);
	    assert(leftInAuthor > 0, "_authorSlicer: should have leftInAuthor > 0");
	    var toTake = min(leftInAuthor, leftToTake);
	    assert(toTake > 0, "_authorSlicer: should have toTake > 0");
	    builderOut.appendNewText(textLeft.substring(0, toTake), curAuthor());
	    forwardInAuthor(toTake);
	    leftToTake -= toTake;
	    textLeft = textLeft.substring(toTake);
	  }
	  assert(charWithinAuthor <= curAuthorWidth(), "_authorSlicer: past end of author");
	  if (charWithinAuthor == curAuthorWidth()) {
	    nextAuthor();
	  }
	}
      },
      setBuilder: function(builder) {
	builderOut = builder;
      }
    };
  }

  function _makeSlicer(C, output) {
    // C: Changeset, output: builder from _makeBuilder
    // C is considered immutable, won't change or be changed

    // OOP style: state in environment
    var charIndex = 0; // 0 <= charIndex <= C.newLen();  maximum value iff atEnd
    var stripIndex = 0; // 0 <= stripIndex <= C.numStrips();  maximum value iff atEnd
    var charWithinStrip = 0; // 0 <= charWithinStrip < curStripWidth()
    var atEnd = false;

    var authorSlicer;
    if (C.authors) {
      authorSlicer = _makeAuthorSlicer(C.authors, output);
    }

    var ptr = 3;
    function curStartIndex() { return C[ptr]; }
    function curNumTaken() { return C[ptr+1]; }
    function curNewText() { return C[ptr+2]; }
    function curStripWidth() { return curNumTaken() + curNewText().length; }
    function assertNotAtEnd() { assert(! atEnd, "_slicer: can't move past changeset end"); }
    function forwardInStrip(numChars) {
      charWithinStrip += numChars;
      charIndex += numChars;
    }
    function nextStrip() {
      assertNotAtEnd();
      assert(charWithinStrip == curStripWidth(), "_slicer: not at strip end");
      charWithinStrip = 0;
      stripIndex++;
      ptr += 3;
      if (stripIndex == C.numStrips()) {
	atEnd = true;
      }
    }
    function curNumNewCharsInRange(start, end) {
      // takes two indices into the current strip's combined "taken" and "new"
      // chars, and returns how many "new" chars are included in the range
      assert(start <= end, "_slicer: curNumNewCharsInRange given out-of-order indices");
      var nt = curNumTaken();
      var nn = curNewText().length;
      var s = nt;
      var e = nt+nn;
      if (s < start) s = start;
      if (e > end) e = end;
      if (e < s) return 0;
      return e-s;
    }

    var self;
    return self = {
      skipChars: function (n) {
	assert(n >= 0, "_slicer: can't skip negative n");
	if (n == 0) return;
	assertNotAtEnd();

	var leftToSkip = n;
	while (leftToSkip > 0) {
	  var leftInStrip = curStripWidth() - charWithinStrip;
	  if (leftToSkip >= leftInStrip) {
	    forwardInStrip(leftInStrip);

	    if (authorSlicer)
	      authorSlicer.skipChars(curNumNewCharsInRange(charWithinStrip,
							   charWithinStrip + leftInStrip));

	    leftToSkip -= leftInStrip;
	    nextStrip();
	  }
	  else {
	    if (authorSlicer)
	      authorSlicer.skipChars(curNumNewCharsInRange(charWithinStrip,
							   charWithinStrip + leftToSkip));

	    forwardInStrip(leftToSkip);
	    leftToSkip = 0;
	  }
	}
      },
      takeChars: function (n) {
	assert(n >= 0, "_slicer: can't take negative n");
	if (n == 0) return;
	assertNotAtEnd();

	var leftToTake = n;
	while (leftToTake > 0) {
	  if (curNumTaken() > 0 && charWithinStrip < curNumTaken()) {
	    // at least one char to take from current strip's numTaken
	    var leftInTaken = (curNumTaken() - charWithinStrip);
	    assert(leftInTaken > 0, "_slicer: should have leftInTaken > 0");
	    var toTake = min(leftInTaken, leftToTake);
	    assert(toTake > 0, "_slicer: should have toTake > 0");
	    output.appendOldText(curStartIndex() + charWithinStrip, toTake);
	    forwardInStrip(toTake);
	    leftToTake -= toTake;
	  }
	  if (leftToTake > 0 && curNewText().length > 0 && charWithinStrip >= curNumTaken() &&
	      charWithinStrip < curStripWidth()) {
	    // at least one char to take from current strip's newText
	    var leftInNewText = (curStripWidth() - charWithinStrip);
	    assert(leftInNewText > 0, "_slicer: should have leftInNewText > 0");
	    var toTake = min(leftInNewText, leftToTake);
	    assert(toTake > 0, "_slicer: should have toTake > 0");
	    var newText = curNewText().substr(charWithinStrip - curNumTaken(), toTake);
	    if (authorSlicer) {
	      authorSlicer.takeChars(newText.length, newText);
	    }
	    else {
	      output.appendNewText(newText);
	    }
	    forwardInStrip(toTake);
	    leftToTake -= toTake;
	  }
	  assert(charWithinStrip <= curStripWidth(), "_slicer: past end of strip");
	  if (charWithinStrip == curStripWidth()) {
	    nextStrip();
	  }
	}
      },
      skipTo: function(n) {
	self.skipChars(n - charIndex);
      }
    };
  }

  array.slicer = function(outputBuilder) {
    return _makeSlicer(this, outputBuilder);
  }

  array.compose = function(next) {
    assert(next.oldLen() == this.newLen(), "mismatched composition");

    var builder = _makeBuilder(this.oldLen(), !!(this.authors || next.authors));
    var slicer = _makeSlicer(this, builder);

    var authorSlicer;
    if (next.authors) {
      authorSlicer = _makeAuthorSlicer(next.authors, builder);
    }

    next.eachStrip(function(s, t, n) {
      slicer.skipTo(s);
      slicer.takeChars(t);
      if (authorSlicer) {
	authorSlicer.takeChars(n.length, n);
      }
      else {
	builder.appendNewText(n);
      }
    }, this);

    return builder.toChangeset();
  };

  array.traverser = function() {
    return _makeTraverser(this);
  }

  function _makeTraverser(C) {
    var s = C[3], t = C[4], n = C[5];
    var nextIndex = 6;
    var indexIntoNewText = 0;

    var authorSlicer;
    if (C.authors) {
      authorSlicer = _makeAuthorSlicer(C.authors, null);
    }

    function advanceIfPossible() {
      if (t == 0 && n == "" && nextIndex < C.length) {
	s = C[nextIndex];
	t = C[nextIndex+1];
	n = C[nextIndex+2];
	nextIndex += 3;
      }
    }

    var self;
    return self = {
      numTakenChars: function() {
	// if starts with taken characters, then how many, else 0
	return (t > 0) ? t : 0;
      },
      numNewChars: function() {
	// if starts with new characters, then how many, else 0
	return (t == 0 && n.length > 0) ? n.length : 0;
      },
      takenCharsStart: function() {
	return (self.numTakenChars() > 0) ? s : 0;
      },
      hasMore: function() {
	return self.numTakenChars() > 0 || self.numNewChars() > 0;
      },
      curIndex: function() {
	return indexIntoNewText;
      },
      consumeTakenChars: function (x) {
	assert(self.numTakenChars() > 0, "_traverser: no taken chars");
	assert(x >= 0 && x <= self.numTakenChars(), "_traverser: bad number of taken chars");
	if (x == 0) return;
	if (t == x) { s = 0;  t = 0; }
	else { s += x;  t -= x; }
	indexIntoNewText += x;
	advanceIfPossible();
      },
      consumeNewChars: function(x) {
	return self.appendNewChars(x, null);
      },
      appendNewChars: function(x, builder) {
	assert(self.numNewChars() > 0, "_traverser: no new chars");
	assert(x >= 0 && x <= self.numNewChars(), "_traverser: bad number of new chars");
	if (x == 0) return "";
	var str = n.substring(0, x);
	n = n.substring(x);
	indexIntoNewText += x;
	advanceIfPossible();

	if (builder) {
	  if (authorSlicer) {
	    authorSlicer.setBuilder(builder);
	    authorSlicer.takeChars(x, str);
	  }
	  else {
	    builder.appendNewText(str);
	  }
	}
	else {
	  if (authorSlicer) authorSlicer.skipChars(x);
	  return str;
	}
      },
      consumeAvailableTakenChars: function() {
	return self.consumeTakenChars(self.numTakenChars());
      },
      consumeAvailableNewChars: function() {
	return self.consumeNewChars(self.numNewChars());
      },
      appendAvailableNewChars: function(builder) {
	return self.appendNewChars(self.numNewChars(), builder);
      }
    };
  }

  array.follow = function(prev, reverseInsertOrder) {
    // prev: Changeset, reverseInsertOrder: boolean

    // A.compose(B.follow(A)) is the merging of Changesets A and B, which operate on the same old text.
    // It is always the same as B.compose(A.follow(B, true)).

    assert(prev.oldLen() == this.oldLen(), "mismatched follow: "+prev.oldLen()+"/"+this.oldLen());
    var builder = _makeBuilder(prev.newLen(), !! this.authors);
    var a = _makeTraverser(prev);
    var b = _makeTraverser(this);
    while (a.hasMore() || b.hasMore()) {
      if (a.numNewChars() > 0 && ! reverseInsertOrder) {
	builder.appendOldText(a.curIndex(), a.numNewChars());
	a.consumeAvailableNewChars();
      }
      else if (b.numNewChars() > 0) {
	b.appendAvailableNewChars(builder);
      }
      else if (a.numNewChars() > 0 && reverseInsertOrder) {
	builder.appendOldText(a.curIndex(), a.numNewChars());
	a.consumeAvailableNewChars();
      }
      else if (! b.hasMore()) a.consumeAvailableTakenChars();
      else if (! a.hasMore()) b.consumeAvailableTakenChars();
      else {
	var x = a.takenCharsStart();
	var y = b.takenCharsStart();
	if (x < y) a.consumeTakenChars(min(a.numTakenChars(), y-x));
	else if (y < x) b.consumeTakenChars(min(b.numTakenChars(), x-y));
	else {
	  var takenByBoth = min(a.numTakenChars(), b.numTakenChars());
	  builder.appendOldText(a.curIndex(), takenByBoth);
	  a.consumeTakenChars(takenByBoth);
	  b.consumeTakenChars(takenByBoth);
	}
      }
    }
    return builder.toChangeset();
  }

  array.encodeToString = function(asBinary) {
    var stringDataArray = [];
    var numsArray = [];
    if (! asBinary) numsArray.push(this[0]);
    numsArray.push(this[1], this[2]);
    this.eachStrip(function(s, t, n) {
      numsArray.push(s, t, n.length);
      stringDataArray.push(n);
    }, this);
    if (! asBinary) {
      return numsArray.join(',')+'|'+stringDataArray.join('');
    }
    else {
      return "A" + Changeset.numberArrayToString(numsArray)
	+escapeCrazyUnicode(stringDataArray.join(''));
    }
  }

  function escapeCrazyUnicode(str) {
    return str.replace(/\\/g, '\\\\').replace(/[\ud800-\udfff]/g, function (c) {
      return "\\u"+("0000"+c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  array.applyToAttributedText = Changeset.applyToAttributedText;

  function splicesFromChanges(c) {
    var splices = [];
    // get a list of splices, [startChar, endChar, newText]
    var traverser = c.traverser();
    var oldTextLength = c.oldLen();
    var indexIntoOldText = 0;
    while (traverser.hasMore() || indexIntoOldText < oldTextLength) {
      var newText = "";
      var startChar = indexIntoOldText;
      var endChar = indexIntoOldText;
      if (traverser.numNewChars() > 0) {
	newText = traverser.consumeAvailableNewChars();
      }
      if (traverser.hasMore()) {
	endChar = traverser.takenCharsStart();
	indexIntoOldText = endChar + traverser.numTakenChars();
	traverser.consumeAvailableTakenChars();
      }
      else {
	endChar = oldTextLength;
	indexIntoOldText = endChar;
      }
      if (endChar != startChar || newText.length > 0) {
	splices.push([startChar, endChar, newText]);
      }
    }
    return splices;
  }

  array.toSplices = function() {
    return splicesFromChanges(this);
  }

  array.characterRangeFollowThis = function(selStartChar, selEndChar, insertionsAfter) {
    var changeset = this;
    // represent the selection as a changeset that replaces the selection with some finite string.
    // Because insertions indicate intention, it doesn't matter what this string is, and even
    // if the selectionChangeset is made to "follow" other changes it will still be the only
    // insertion.
    var selectionChangeset =
      Changeset(changeset.oldLen()).builder().appendOldText(0, selStartChar).appendNewText(
	"X").appendOldText(selEndChar, changeset.oldLen() - selEndChar).toChangeset();
    var newSelectionChangeset = selectionChangeset.follow(changeset, insertionsAfter);
    var selectionSplices = newSelectionChangeset.toSplices();
    function includeChar(i) {
      if (! includeChar.calledYet) {
	selStartChar = i;
	selEndChar = i;
	includeChar.calledYet = true;
      }
      else {
	if (i < selStartChar) selStartChar = i;
	if (i > selEndChar) selEndChar = i;
      }
    }
    for(var i=0; i<selectionSplices.length; i++) {
      var s = selectionSplices[i];
      includeChar(s[0]);
      includeChar(s[1]);
    }
    return [selStartChar, selEndChar];
  }

  return array;
}

Changeset.MAGIC = "Changeset";
Changeset.makeSplice = function(oldLength, spliceStart, numRemoved, stringInserted) {
  oldLength = (oldLength || 0);
  spliceStart = (spliceStart || 0);
  numRemoved = (numRemoved || 0);
  stringInserted = String(stringInserted || "");

  var builder = Changeset(oldLength).builder();
  builder.appendOldText(0, spliceStart);
  builder.appendNewText(stringInserted);
  builder.appendOldText(spliceStart + numRemoved, oldLength - numRemoved - spliceStart);
  return builder.toChangeset();
};
Changeset.identity = function(len) {
  return Changeset(len).builder().appendOldText(0, len).toChangeset();
};
Changeset.decodeFromString = function(str) {
  function error(msg) { var e = new Error(msg); e.easysync = true; throw e; }
  function toHex(str) {
    var a = [];
    a.push("length["+str.length+"]:");
    var TRUNC=20;
    for(var i=0;i<str.substring(0,TRUNC).length;i++) {
      a.push(("000"+str.charCodeAt(i).toString(16)).slice(-4));
    }
    if (str.length > TRUNC) a.push("...");
    return a.join(' ');
  }
  function unescapeCrazyUnicode(str) {
    return str.replace(/\\(u....|\\)/g, function(seq) {
      if (seq == "\\\\") return "\\";
      return String.fromCharCode(Number("0x"+seq.substring(2)));
    });
  }

  var numData, stringData;
  var binary = false;
  var typ = str.charAt(0);
  if (typ == "B" || typ == "A") {
    var result = Changeset.numberArrayFromString(str, 1);
    numData = result[0];
    stringData = result[1];
    if (typ == "A") {
      stringData = unescapeCrazyUnicode(stringData);
    }
    binary = true;
  }
  else if (typ == "C") {
    var barPosition = str.indexOf('|');
    numData = str.substring(0, barPosition).split(',');
    stringData = str.substring(barPosition+1);
  }
  else {
    error("Not a changeset: "+toHex(str));
  }
  var stringDataOffset = 0;
  var array = [];
  var ptr;
  if (binary) {
    array.push("Changeset", numData[0], numData[1]);
    var ptr = 2;
  }
  else {
    array.push(numData[0], Number(numData[1]), Number(numData[2]));
    var ptr = 3;
  }
  while (ptr < numData.length) {
    array.push(Number(numData[ptr++]), Number(numData[ptr++]));
    var newTextLength = Number(numData[ptr++]);
    array.push(stringData.substr(stringDataOffset, newTextLength));
    stringDataOffset += newTextLength;
  }
  if (stringDataOffset != stringData.length) {
    error("Extra character data beyond end of encoded string ("+toHex(str)+")");
  }
  return Changeset(array);
};

Changeset.numberArrayToString = function(nums) {
  var array = [];
  function writeNum(n) {
    // does not support negative numbers
    var twentyEightBit = (n & 0xfffffff);
    if (twentyEightBit <= 0x7fff) {
      array.push(String.fromCharCode(twentyEightBit));
    }
    else {
      array.push(String.fromCharCode(0xa000 | (twentyEightBit >> 15),
				     twentyEightBit & 0x7fff));
    }
  }
  writeNum(nums.length);
  var len = nums.length;
  for(var i=0;i<len;i++) {
    writeNum(nums[i]);
  }
  return array.join('');
};

Changeset.numberArrayFromString = function(str, startIndex) {
  // returns [numberArray, remainingString]
  var nums = [];
  var strIndex = (startIndex || 0);
  function readNum() {
    var n = str.charCodeAt(strIndex++);
    if (n > 0x7fff) {
      if (n >= 0xa000) {
	n = (((n & 0x1fff) << 15) | str.charCodeAt(strIndex++));
      }
      else {
	// legacy format
	n = (((n & 0x1fff) << 16) | str.charCodeAt(strIndex++));
      }
    }
    return n;
  }
  var len = readNum();
  for(var i=0;i<len;i++) {
    nums.push(readNum());
  }
  return [nums, str.substring(strIndex)];
};

(function() {
  function repeatString(str, times) {
    if (times <= 0) return "";
    var s = repeatString(str, times >> 1);
    s += s;
    if (times & 1) s += str;
    return s;
  }
  function chr(n) { return String.fromCharCode(n+48); }
  function ord(c) { return c.charCodeAt(0)-48; }
  function runMatcher(c) {
    // Takes "A" and returns /\u0041+/g .
    // Avoid creating new objects unnecessarily by caching matchers
    // as properties of this function.
    var re = runMatcher[c];
    if (re) return re;
    re = runMatcher[c] = new RegExp("\\u"+("0000"+c.charCodeAt(0).toString(16)).slice(-4)+"+", 'g');
    return re;
  }
  function runLength(str, idx, c) {
    var re = runMatcher(c);
    re.lastIndex = idx;
    var result = re.exec(str);
    if (result && result[0]) {
      return result[0].length;
    }
    return 0;
  }

  // emptyObj may be a StorableObject
  Changeset.initAttributedText = function(emptyObj, initialString, initialAuthor) {
    var obj = emptyObj;
    obj.authorMap = { 1: (initialAuthor || '') };
    obj.text = (initialString || '');
    obj.attribs = repeatString(chr(1), obj.text.length);
    return obj;
  };
  Changeset.gcAttributedText = function(atObj) {
    // "garbage collect" the list of authors
    var removedAuthors = [];
    for(var a in atObj.authorMap) {
      if (atObj.attribs.indexOf(chr(Number(a))) < 0) {
	removedAuthors.push(atObj.authorMap[a]);
	delete atObj.authorMap[a];
      }
    }
    return removedAuthors;
  };
  Changeset.cloneAttributedText = function(emptyObj, atObj) {
    var obj = emptyObj;
    obj.text = atObj.text; // string
    if (atObj.attribs) obj.attribs = atObj.attribs; // string
    if (atObj.attribs_c) obj.attribs_c = atObj.attribs_c; // string
    obj.authorMap = {};
    for(var a in atObj.authorMap) {
      obj.authorMap[a] = atObj.authorMap[a];
    }
    return obj;
  };
  Changeset.applyToAttributedText = function(atObj, C) {
    C = (C || this);
    var oldText = atObj.text;
    var oldAttribs = atObj.attribs;
    Changeset._assert(C.isChangeset, "applyToAttributedText: 'this' is not a changeset");
    Changeset._assert(oldText.length == C.oldLen(),
		      "applyToAttributedText: mismatch "+oldText.length+" / "+C.oldLen());
    var textBuf = [];
    var attribsBuf = [];
    var authorMap = atObj.authorMap;
    function authorId(author) {
      for(var a in authorMap) {
	if (authorMap[Number(a)] === author) {
	  return Number(a);
	}
      }
      for(var i=1;i<=60000;i++) {
	// don't use "in" because it's currently broken on StorableObjects
	if (authorMap[i] === undefined) {
	  authorMap[i] = author;
	  return i;
	}
      }
    }
    var myBuilder = { appendNewText: function(txt, author) {
      // object that acts as a "builder" in that it receives requests from
      // authorSlicer to append text attributed to different authors
      attribsBuf.push(repeatString(chr(authorId(author)), txt.length));
    } };
    var authorSlicer;
    if (C.authors) {
      authorSlicer = C.authorSlicer(myBuilder);
    }
    C.eachStrip(function (s, t, n) {
      textBuf.push(oldText.substr(s, t), n);
      attribsBuf.push(oldAttribs.substr(s, t));
      if (authorSlicer) {
	authorSlicer.takeChars(n.length, n);
      }
      else {
	myBuilder.appendNewText(n, '');
      }
    });
    atObj.text = textBuf.join('');
    atObj.attribs = attribsBuf.join('');
    return atObj;
  };
  Changeset.getAttributedTextCharAuthor = function(atObj, idx) {
    return atObj.authorMap[ord(atObj.attribs.charAt(idx))];
  };
  Changeset.getAttributedTextCharRunLength = function(atObj, idx) {
    var c = atObj.attribs.charAt(idx);
    return runLength(atObj.attribs, idx, c);
  };
  Changeset.eachAuthorInAttributedText = function(atObj, func) {
    // call func(author, authorNum)
    for(var a in atObj.authorMap) {
      if (func(atObj.authorMap[a], Number(a))) break;
    }
  };
  Changeset.getAttributedTextAuthorByNum = function(atObj, n) {
    return atObj.authorMap[n];
  };
  // Compressed attributed text can be cloned, but nothing else until uncompressed!!
  Changeset.compressAttributedText = function(atObj) {
    // idempotent, mutates the object, returns it
    if (atObj.attribs) {
      atObj.attribs_c = atObj.attribs.replace(/([\s\S])\1{0,63}/g, function(run) {
	return run.charAt(0)+chr(run.length);;
      });
      delete atObj.attribs;
    }
    return atObj;
  };
  Changeset.decompressAttributedText = function(atObj) {
    // idempotent, mutates the object, returns it
    if (atObj.attribs_c) {
      atObj.attribs = atObj.attribs_c.replace(/[\s\S][\s\S]/g, function(run) {
	return repeatString(run.charAt(0), ord(run.charAt(1)));
      });
      delete atObj.attribs_c;
    }
    return atObj;
  };
})();
