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


import("etherpad.collab.ace.easysync1");
import("etherpad.collab.ace.easysync2");
import("sqlbase.sqlbase");
import("fastJSON");
import("sqlbase.sqlcommon.*");
import("etherpad.collab.ace.contentcollector.sanitizeUnicode");

function _getPadStringArrayNumId(padId, arrayName) {
  var stmnt = "SELECT NUMID FROM "+btquote("PAD_"+arrayName.toUpperCase()+"_META")+
    " WHERE ("+btquote("ID")+" = ?)";

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      pstmnt.setString(1, padId);
      var resultSet = pstmnt.executeQuery();
      return closing(resultSet, function() {
        if (! resultSet.next()) {
          return -1;
        }
        return resultSet.getInt(1);
      });
    });
  });
}

function _getEntirePadStringArray(padId, arrayName) {
  var numId = _getPadStringArrayNumId(padId, arrayName);
  if (numId < 0) {
    return [];
  }

  var stmnt = "SELECT PAGESTART, OFFSETS, DATA FROM "+btquote("PAD_"+arrayName.toUpperCase()+"_TEXT")+
    " WHERE ("+btquote("NUMID")+" = ?)";

  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      pstmnt.setInt(1, numId);
      var resultSet = pstmnt.executeQuery();
      return closing(resultSet, function() {
        var array = [];
        while (resultSet.next()) {
          var pageStart = resultSet.getInt(1);
          var lengthsString = resultSet.getString(2);
          var dataString = resultSet.getString(3);
          var dataIndex = 0;
          var arrayIndex = pageStart;
          lengthsString.split(',').forEach(function(len) {
            if (len) {
              len = Number(len);
              array[arrayIndex] = dataString.substr(dataIndex, len);
              dataIndex += len;
            }
            arrayIndex++;
          });
        }
        return array;
      });
    });
  });
}

function _overwriteEntirePadStringArray(padId, arrayName, array) {
  var numId = _getPadStringArrayNumId(padId, arrayName);
  if (numId < 0) {
    // generate numId
    withConnection(function(conn) {
      var ps = conn.prepareStatement("INSERT INTO "+btquote("PAD_"+arrayName.toUpperCase()+"_META")+
                                     " ("+btquote("ID")+") VALUES (?)",
                                     java.sql.Statement.RETURN_GENERATED_KEYS);
      closing(ps, function() {
        ps.setString(1, padId);
        ps.executeUpdate();
        var keys = ps.getGeneratedKeys();
        if ((! keys) || (! keys.next())) {
          throw new Error("Couldn't generate key for "+arrayName+" table for pad "+padId);
        }
        closing(keys, function() {
          numId = keys.getInt(1);
        });
      });
    });
  }

  withConnection(function(conn) {

    var stmnt1 = "DELETE FROM "+btquote("PAD_"+arrayName.toUpperCase()+"_TEXT")+
      " WHERE ("+btquote("NUMID")+" = ?)";
    var pstmnt1 = conn.prepareStatement(stmnt1);
    closing(pstmnt1, function() {
      pstmnt1.setInt(1, numId);
      pstmnt1.executeUpdate();
    });

    var PAGE_SIZE = 20;
    var numPages = Math.floor((array.length-1) / PAGE_SIZE + 1);

    var PAGES_PER_BATCH = 20;
    var curPage = 0;

    while (curPage < numPages) {
      var stmnt2 = "INSERT INTO "+btquote("PAD_"+arrayName.toUpperCase()+"_TEXT")+
        " ("+btquote("NUMID")+", "+btquote("PAGESTART")+", "+btquote("OFFSETS")+
        ", "+btquote("DATA")+") VALUES (?, ?, ?, ?)";
      var pstmnt2 = conn.prepareStatement(stmnt2);
      closing(pstmnt2, function() {
        for(var n=0;n<PAGES_PER_BATCH && curPage < numPages;n++) {
          var pageStart = curPage*PAGE_SIZE;
          var r = pageStart;
          var lengthPieces = [];
          var dataPieces = [];
          for(var i=0;i<PAGE_SIZE;i++) {
            var str = (array[r] || '');
            dataPieces.push(str);
            lengthPieces.push(String(str.length || ''));
            r++;
          }
          var lengthsString = lengthPieces.join(',');
          var dataString = dataPieces.join('');
          pstmnt2.setInt(1, numId);
          pstmnt2.setInt(2, pageStart);
          pstmnt2.setString(3, lengthsString);
          pstmnt2.setString(4, dataString);
          pstmnt2.addBatch();

          curPage++;
        }
        pstmnt2.executeBatch();
      });
    }
  });

}

function _getEntirePadJSONArray(padId, arrayName) {
  var array = _getEntirePadStringArray(padId, arrayName);
  for(var k in array) {
    if (array[k]) {
      array[k] = fastJSON.parse(array[k]);
    }
  }
  return array;
}

function _overwriteEntirePadJSONArray(padId, arrayName, objArray) {
  var array = [];
  for(var k in objArray) {
    if (objArray[k]) {
      array[k] = fastJSON.stringify(objArray[k]);
    }
  }
  _overwriteEntirePadStringArray(padId, arrayName, array);
}

function _getMigrationPad(padId) {
  var oldRevs = _getEntirePadStringArray(padId, "revs");
  var oldRevMeta = _getEntirePadJSONArray(padId, "revmeta");
  var oldAuthors = _getEntirePadJSONArray(padId, "authors");
  var oldMeta = sqlbase.getJSON("PAD_META", padId);

  var oldPad = {
    getHeadRevisionNumber: function() {
      return oldMeta.head;
    },
    getRevisionChangesetString: function(r) {
      return oldRevs[r];
    },
    getRevisionAuthor: function(r) {
      return oldMeta.numToAuthor[oldRevMeta[r].a];
    },
    getId: function() { return padId; },
    getKeyRevisionNumber: function(r) {
      return Math.floor(r / oldMeta.keyRevInterval) * oldMeta.keyRevInterval;
    },
    getInternalRevisionText: function(r) {
      if (r != oldPad.getKeyRevisionNumber(r)) {
	throw new Error("Assertion error: "+r+" != "+oldPad.getKeyRevisionNumber(r));
      }
      return oldRevMeta[r].atext.text;
    },
    _meta: oldMeta,
    getAuthorArrayEntry: function(n) {
      return oldAuthors[n];
    },
    getRevMetaArrayEntry: function(r) {
      return oldRevMeta[r];
    }
  };

  var apool = new easysync2.AttribPool();
  var newRevMeta = [];
  var newAuthors = [];
  var newRevs = [];
  var metaPropsToDelete = [];

  var newPad = {
    pool: function() { return apool; },
    setAuthorArrayEntry: function(n, obj) {
      newAuthors[n] = obj;
    },
    setRevMetaArrayEntry: function(r, obj) {
      newRevMeta[r] = obj;
    },
    setRevsArrayEntry: function(r, cs) {
      newRevs[r] = cs;
    },
    deleteMetaProp: function(propName) {
      metaPropsToDelete.push(propName);
    }
  };

  function writeToDB() {
    var newMeta = {};
    for(var k in oldMeta) {
      newMeta[k] = oldMeta[k];
    }
    metaPropsToDelete.forEach(function(p) {
      delete newMeta[p];
    });

    sqlbase.putJSON("PAD_META", padId, newMeta);
    sqlbase.putJSON("PAD_APOOL", padId, apool.toJsonable());

    _overwriteEntirePadStringArray(padId, "revs", newRevs);
    _overwriteEntirePadJSONArray(padId, "revmeta", newRevMeta);
    _overwriteEntirePadJSONArray(padId, "authors", newAuthors);
  }

  return {oldPad:oldPad, newPad:newPad, writeToDB:writeToDB};
}

function migratePad(padId) {

  var mpad = _getMigrationPad(padId);
  var oldPad = mpad.oldPad;
  var newPad = mpad.newPad;

  var headRev = oldPad.getHeadRevisionNumber();
  var txt = "\n";
  var newChangesets = [];
  var newChangesetAuthorNums = [];
  var cumCs = easysync2.Changeset.identity(1);

  var pool = newPad.pool();

  var isExtraFinalNewline = false;

  function authorToNewNum(author) {
    return pool.putAttrib(['author',author||'']);
  }

  //S var oldTotalChangesetSize = 0;
  //S var newTotalChangesetSize = 0;
  //S function stringSize(str) {
  //S return new java.lang.String(str).getBytes("UTF-8").length;
  //S }

  //P var diffTotals = [];
  for(var r=0;r<=headRev;r++) {
    //P var times = [];
    //P times.push(+new Date);
    var author = oldPad.getRevisionAuthor(r);
    //P times.push(+new Date);
    newChangesetAuthorNums.push(authorToNewNum(author));

    var newCs, newText;
    if (r == 0) {
      newText = oldPad.getInternalRevisionText(0);
      newCs = getInitialChangeset(newText, pool, author);
      //S oldTotalChangesetSize += stringSize(pad.getRevisionChangesetString(0));
    }
    else {
      var oldCsStr = oldPad.getRevisionChangesetString(r);
      //S oldTotalChangesetSize += stringSize(oldCsStr);
      //P times.push(+new Date);
      var oldCs = easysync1.Changeset.decodeFromString(oldCsStr);
      //P times.push(+new Date);

      /*var newTextFromOldCs = oldCs.applyToText(txt);
      if (newTextFromOldCs.charAt(newTextFromOldCs.length-1) != '\n') {
	var e = new Error("Violation of final newline property at revision "+r);
	e.finalNewlineMissing = true;
	throw e;
      }*/
      //var newCsNewTxt1 = upgradeChangeset(oldCs, txt, pool, author);
      var oldIsExtraFinalNewline = isExtraFinalNewline;
      var newCsNewTxt2 = upgradeChangeset(oldCs, txt, pool, author, isExtraFinalNewline);
      //P times.push(+new Date);
      /*if (newCsNewTxt1[1] != newCsNewTxt2[1]) {
	_putFile(newCsNewTxt1[1], "/tmp/file1");
	_putFile(newCsNewTxt2[1], "/tmp/file2");
	throw new Error("MISMATCH 1");
      }
      if (newCsNewTxt1[0] != newCsNewTxt2[0]) {
	_putFile(newCsNewTxt1[0], "/tmp/file1");
	_putFile(newCsNewTxt2[0], "/tmp/file2");
	throw new Error("MISMATCH 0");
      }*/
      newCs = newCsNewTxt2[0];
      newText = newCsNewTxt2[1];
      isExtraFinalNewline = newCsNewTxt2[2];

      /*if (oldIsExtraFinalNewline || isExtraFinalNewline) {
	System.out.print("\nnewline fix for rev "+r+"/"+headRev+"... ");
      }*/
    }

    var oldText = txt;
    newChangesets.push(newCs);
    txt = newText;
    //System.out.println(easysync2.Changeset.toBaseTen(cumCs)+" * "+
    //easysync2.Changeset.toBaseTen(newCs));
    /*cumCs = easysync2.Changeset.checkRep(easysync2.Changeset.compose(cumCs, newCs));
    if (easysync2.Changeset.applyToText(cumCs, "\n") != txt) {
      throw new Error("cumCs mismatch");
    }*/

    //P times.push(+new Date);

    easysync2.Changeset.checkRep(newCs);
    //P times.push(+new Date);
    var origText = txt;
    if (isExtraFinalNewline) {
      origText = origText.slice(0, -1);
    }
    if (r == oldPad.getKeyRevisionNumber(r)) {
      // only check key revisions (and final outcome), for speed
      if (oldPad.getInternalRevisionText(r) != origText) {
	var expected = oldPad.getInternalRevisionText(r);
	var actual = origText;
	//_putFile(expected, "/tmp/file1");
	//_putFile(actual, "/tmp/file2");
	//_putFile(oldText, "/tmp/file3");
	//java.lang.System.out.println(String(oldCs));
	//java.lang.System.out.println(easysync2.Changeset.toBaseTen(newCs));
	throw new Error("Migration mismatch, pad "+padId+", revision "+r);
      }
    }

    //S newTotalChangesetSize += stringSize(newCs);

    //P if (r > 0) {
    //P var diffs = [];
    //P for(var i=0;i<times.length-1;i++) {
    //P diffs[i] = times[i+1] - times[i];
    //P }
    //P for(var i=0;i<diffs.length;i++) {
    //P diffTotals[i] = (diffTotals[i] || 0) + diffs[i]*1000/headRev;
    //P }
    //P }
  }
  //P System.out.println(String(diffTotals));

  //S System.out.println("New data is "+(newTotalChangesetSize/oldTotalChangesetSize*100)+
  //S "% size of old data (average "+(newTotalChangesetSize/(headRev+1))+
  //S " bytes instead of "+(oldTotalChangesetSize/(headRev+1))+")");

  var atext = easysync2.Changeset.makeAText("\n");
  for(var r=0; r<=headRev; r++) {
    newPad.setRevsArrayEntry(r, newChangesets[r]);

    atext = easysync2.Changeset.applyToAText(newChangesets[r], atext, pool);

    var rm = oldPad.getRevMetaArrayEntry(r);
    rm.a = newChangesetAuthorNums[r];
    if (rm.atext) {
      rm.atext = easysync2.Changeset.cloneAText(atext);
    }
    newPad.setRevMetaArrayEntry(r, rm);
  }

  var newAuthors = [];
  var newAuthorDatas = [];
  for(var k in oldPad._meta.numToAuthor) {
    var n = Number(k);
    var authorData = oldPad.getAuthorArrayEntry(n) || {};
    var authorName = oldPad._meta.numToAuthor[n];
    var newAuthorNum = pool.putAttrib(['author',authorName]);
    newPad.setAuthorArrayEntry(newAuthorNum, authorData);
  }

  newPad.deleteMetaProp('numToAuthor');
  newPad.deleteMetaProp('authorToNum');

  mpad.writeToDB();
}

function getInitialChangeset(txt, pool, author) {
  var txt2 = txt.substring(0, txt.length-1); // strip off final newline

  var assem = easysync2.Changeset.smartOpAssembler();
  assem.appendOpWithText('+', txt2, pool && author && [['author',author]], pool);
  assem.endDocument();
  return easysync2.Changeset.pack(1, txt2.length+1, assem.toString(), txt2);
}

function upgradeChangeset(cs, inputText, pool, author, isExtraNewlineInSource) {
  var attribs = '';
  if (pool && author) {
    attribs = '*'+easysync2.Changeset.numToString(pool.putAttrib(['author', author]));
  }

  function keepLastCharacter(c) {
    if (! c[c.length-1] && c[c.length-3] + c[c.length-2] >= (c.oldLen() - 1)) {
      c[c.length-2] = c.oldLen() - c[c.length-3];
    }
    else {
      c.push(c.oldLen() - 1, 1, "");
    }
  }

  var isExtraNewlineInOutput = false;
  if (isExtraNewlineInSource) {
    cs[1] += 1; // oldLen ++
  }
  if ((cs[cs.length-1] && cs[cs.length-1].slice(-1) != '\n') ||
      ((! cs[cs.length-1]) && inputText.charAt(cs[cs.length-3] + cs[cs.length-2] - 1) != '\n')) {
    // new text won't end with newline!
    if (isExtraNewlineInSource) {
      keepLastCharacter(cs);
    }
    else {
      cs[cs.length-1] += "\n";
    }
    cs[2] += 1; // newLen ++
    isExtraNewlineInOutput = true;
  }

  var oldLen = cs.oldLen();
  var newLen = cs.newLen();

  // final-newline-preserving modifications to changeset {{{
  //   These fixes are required for changesets that don't respect the
  //   new rule that the final newline of the document not be touched,
  //   and also for changesets tweaked above.  It is important that the
  //   fixed changesets obey all the constraints on version 1 changesets
  //   so that they may become valid version 2 changesets.
  {
    function collapsePotentialEmptyLastTake(c) {
      if (c[c.length-2] == 0 && c.length > 6) {
	if (! c[c.length-1]) {
	  // last strip doesn't take or insert now
	  c.length -= 3;
	}
	else {
	  // the last two strips should be merged
	  // e.g. fo\n -> rock\nbar\n: then in this block,
	  // "Changeset,3,9,0,0,r,1,1,ck,2,0,\nbar" becomes
	  // "Changeset,3,9,0,0,r,1,1,ck\nbar"
	  c[c.length-4] += c[c.length-1];
	  c.length -= 3;
	}
      }
    }
    var lastStripStart = cs[cs.length-3];
    var lastStripTake = cs[cs.length-2];
    var lastStripInsert = cs[cs.length-1];
    if (lastStripStart + lastStripTake == oldLen && lastStripInsert) {
      // an insert at end
      // e.g. foo\n -> foo\nbar\n:
      // "Changeset,4,8,0,4,bar\n" becomes "Changeset,4,8,0,3,\nbar,3,1,"
      // first make the previous newline part of the insertion
      cs[cs.length-2] -= 1;
      cs[cs.length-1] = '\n'+cs[cs.length-1].slice(0,-1);
      collapsePotentialEmptyLastTake(cs);
      keepLastCharacter(cs);
    }
    else if (lastStripStart + lastStripTake < oldLen && ! lastStripInsert) {
      // ends with pure deletion
      cs[cs.length-2] -= 1;
      collapsePotentialEmptyLastTake(cs);
      keepLastCharacter(cs);
    }
    else if (lastStripStart + lastStripTake < oldLen) {
      // ends with replacement
      cs[cs.length-1] = cs[cs.length-1].slice(0,-1);
      keepLastCharacter(cs);
    }
  }
  // }}}

  var ops = [];
  var lastOpcode = '';
  function appendOp(opcode, text, startChar, endChar) {
    function num(n) {
      return easysync2.Changeset.numToString(n);
    }
    var lines = 0;
    var lastNewlineEnd = startChar;
    for (;;) {
      var index = text.indexOf('\n', lastNewlineEnd);
      if (index < 0 || index >= endChar) {
	break;
      }
      lines++;
      lastNewlineEnd = index+1;
    }
    var a = (opcode == '+' ? attribs : '');
    var multilineChars = (lastNewlineEnd - startChar);
    var seqLength = endChar - startChar;
    var op = '';
    if (lines > 0) {
      op = [a, '|', num(lines), opcode, num(multilineChars)].join('');
    }
    if (multilineChars < seqLength) {
      op += [a, opcode, num(seqLength - multilineChars)].join('');
    }
    if (op) {
      // we reorder a single - and a single +
      if (opcode == '-' && lastOpcode == '+') {
	ops.splice(ops.length-1, 0, op);
      }
      else {
	ops.push(op);
	lastOpcode = opcode;
      }
    }
  }

  var oldPos = 0;

  var textPieces = [];
  var charBankPieces = [];
  cs.eachStrip(function(start, take, insert) {
    if (start > oldPos) {
      appendOp('-', inputText, oldPos, start);
    }
    if (take) {
      if (start+take < oldLen || insert) {
	appendOp('=', inputText, start, start+take);
      }
      textPieces.push(inputText.substring(start, start+take));
    }
    if (insert) {
      appendOp('+', insert, 0, insert.length);
      textPieces.push(insert);
      charBankPieces.push(insert);
    }
    oldPos = start+take;
  });
  // ... and no final deletions after the newline fixing.

  var newCs = easysync2.Changeset.pack(oldLen, newLen, ops.join(''),
                                       sanitizeUnicode(charBankPieces.join('')));
  var newText = textPieces.join('');

  return [newCs, newText, isExtraNewlineInOutput];
}

////////////////////////////////////////////////////////////////////////////////

// unicode issues: 5SaYQp7cKV

// // hard-coded just for testing; any pad is allowed to have corruption.
// var newlineCorruptedPads = [
//   '0OCGFKkjDv', '14dWjOiOxP', '1LL8XQCBjC', '1jMnjEEK6e', '21',
//   '23DytOPN7d', '32YzfdT2xS', '3E6GB7l7FZ', '3Un8qaCfJh', '3YAj3rC9em',
//   '3vY2eaHSw5', '4834RRTLlg', '4Fm1iVSTWI', '5NpTNqWHGC', '7FYNSdYQVa',
//   '7RZCbvgw1z', '8EVpyN6HyY', '8P5mPRxPVr', '8aHFRmLxKR', '8dsj9eGQfP',
//   'BSoGobOJZZ', 'Bf0uVghKy0', 'C2f3umStKd', 'CHlu2CA8F3', 'D2WEwgvg1W',
//   'DNLTpuP2wl', 'DwNpm2TDgu', 'EKPByZ3EGZ', 'FwQxu6UKQx', 'HUn9O34rFl',
//   'JKZhxMo20E', 'JVjuukL42N', 'JVuBlWxaxL', 'Jmw5lPNYcl', 'KnZHz6jE2P',
//   'Luyp6ylbgR', 'MB6lPoN1eI', 'McsCrQUM6c', 'NWIuVobIw9', 'OKERTLQCCn',
//   'OchiOchi', 'OfhKHCB8jJ', 'OkM3Jv3XY9', 'PX5Z89mx29', 'PdmKQIvOEd',
//   'R9NQNB66qt', 'RvULFSvCbV', 'RyLJC6Qo1x', 'SBlKLwr2Ag', 'SavD72Q9P7',
//   'SfXyxseAeF', 'TTGZ4yO2PI', 'U3U7rT3d6w', 'UFmqpQIDAi', 'V7Or0QQk4m',
//   'VPCM5ReAQm', 'VvIYHzIJUY', 'W0Ccc3BVGb', 'Wv3cGgSgjg', 'WwVPgaZUK5',
//   'WyIFUJXfm5', 'XxESEsgQ6R', 'Yc5Yq3WCuU', 'ZRqCFaRx6h', 'ZepX6TLFbD',
//   'bSeImT5po4', 'bqIlTkFDiH', 'btt9vNPSQ9', 'c97YJj8PSN', 'd9YV3sypKF',
//   'eDzzkrwDRU', 'eFQJZWclzo', 'eaz44OhFDu', 'ehKkx1YpLA', 'ep',
//   'foNq3v3e9T', 'form6rooma', 'fqhtIHG0Ii', 'fvZyCRZjv2', 'gZnadICPYV',
//   'gvGXtMKhQk', 'h7AYuTxUOd', 'hc1UZSti3J', 'hrFQtae2jW', 'i8rENUZUMu',
//   'iFW9dceEmh', 'iRNEc8SlOc', 'jEDsDgDlaK', 'jo8ngXlSJh', 'kgJrB9Gh2M',
//   'klassennetz76da2661f8ceccfe74faf97d25a4b418',
//   'klassennetzf06d4d8176d0804697d9650f836cb1f7', 'lDHgmfyiSu',
//   'mA1cbvxFwA', 'mSJpW1th29', 'mXHAqv1Emu', 'monocles12', 'n0NhU3FxxT',
//   'ng7AlzPb5b', 'ntbErnnuyz', 'oVnMO0dX80', 'omOTPVY3Gl', 'p5aNFCfYG9',
//   'pYxjVCILuL', 'phylab', 'pjVBFmnhf1', 'qGohFW3Lbr', 'qYlbjeIHDs',
//   'qgf4OwkFI6', 'qsi', 'rJQ09pRexM', 'snNjlS1aLC', 'tYKC53TDF9',
//   'u1vZmL8Yjv', 'ur4sb7DBJB', 'vesti', 'w9NJegEAZt', 'wDwlSCby2s',
//   'wGFJJRT514', 'wTgEoQGqng', 'xomMZGhius', 'yFEFYWBSvr', 'z7tGFKsGk6',
//   'zIJWNK8Z4i', 'zNMGJYI7hq'];

// function _time(f) {
//   var t1 = +(new Date);
//   f();
//   var t2 = +(new Date);
//   return t2 - t1;
// }

// function listAllRevisionCounts() {
//   var padList = sqlbase.getAllJSONKeys("PAD_META");
//   //padList.length = 10;
//   padList = padList.slice(68000, 68100);
//   padList.forEach(function(id) {
//     model.accessPadGlobal(id, function(pad) {
//       System.out.println((new java.lang.Integer(pad.getHeadRevisionNumber()).toString())+
// 			 " "+id);
//       dbwriter.writePadNow(pad, true);
//     }, 'r');
//   });
// }

// function verifyAllPads() {
//   //var padList = sqlbase.getAllJSONKeys("PAD_META");
//   //padList = newlineCorruptedPads;
//   var padList = ['0OCGFKkjDv'];
//   //padList = ['form6rooma'];
//   //padList.length = 10;
//   var numOks = 0;
//   var numErrors = 0;
//   var numNewlineBugs = 0;
//   var longestPad;
//   var longestPadTime = -1;
//   System.out.println(padList.length+" pads.");
//   var totalTime = _time(function() {
//     padList.forEach(function(id) {
//       model.accessPadGlobal(id, function(pad) {
// 	var padTime = _time(function() {
// 	  System.out.print(id+"... ");
// 	  try {
// 	    verifyMigration(pad);
// 	    System.out.println("OK ("+(++numOks)+")");
// 	  }
// 	  catch (e) {
// 	    System.out.println("ERROR ("+(++numErrors)+")"+(e.finalNewlineMissing?" [newline]":""));
// 	    System.out.println(e.toString());
// 	    if (e.finalNewlineMissing) {
// 	      numNewlineBugs++;
// 	    }
// 	  }
// 	});
// 	if (padTime > longestPadTime) {
// 	  longestPadTime = padTime;
// 	  longestPad = id;
// 	}
//       }, 'r');
//     });
//   });
//   System.out.println("finished verifyAllPads in "+(totalTime/1000)+" seconds.");
//   System.out.println(numOks+" OK");
//   System.out.println(numErrors+" ERROR");
//   System.out.println("Most time-consuming pad: "+longestPad+" / "+longestPadTime+" ms");
// }

// function _literal(v) {
//   if ((typeof v) == "string") {
//     return '"'+v.replace(/[\\\"]/g, '\\$1').replace(/\n/g, '\\n')+'"';
//   }
//   else return v.toSource();
// }

// function _putFile(str, path) {
//   var writer = new java.io.FileWriter(path);
//   writer.write(str);
//   writer.close();
// }
