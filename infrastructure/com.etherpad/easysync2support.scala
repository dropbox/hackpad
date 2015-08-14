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

package com.etherpad;

object Easysync2Support {

  def numToString(d: Int): String = java.lang.Integer.toString(d.toInt, 36); // lowercase
  def stringToNum(s: String): Int = java.lang.Integer.parseInt(s, 36);
  
  def opAssembler() = new OpAssembler();
  
  class OpAssembler() {
    val buf = new StringBuilder(1000);
    def append(op: Op) {
      append(op.opcode, op.chars, op.lines, op.attribs);
    }
    def append(opcode: String, chars: Int, lines: Int, attribs: String) {
      buf.append(attribs);
      if (lines > 0) {
        buf.append('|');
        buf.append(numToString(lines));
      }
      buf.append(opcode);
      buf.append(numToString(chars));
    }
    override def toString(): String = buf.toString;
    def clear() { buf.clear; }
  }

  def isAlphanum(c: Char) = (c >= '0' && c <= '9' || c >= 'a' && c <= 'z');

  case object OpParseError extends Error;  
  
  def nextOpInString(str: String, startIndex: Int): Object = {
    var i = startIndex;

    try {
      def lookingAt(c: Char) = (i < str.length && str.charAt(i) == c);
      def lookingAtAlphanum() = (i < str.length && isAlphanum(str.charAt(i)));
      def atEnd() = (i >= str.length);
      def readAlphanum(): Int = {
        if (! lookingAtAlphanum()) {
          throw OpParseError;
        }
        val start = i;
        while (lookingAtAlphanum()) {
          i += 1;
        }
        val end = i;
        stringToNum(str.substring(start, end));
      }
      
      while (lookingAt('*')) {
        i += 1;
        if (! lookingAtAlphanum()) {
          throw OpParseError;
        }
        while (lookingAtAlphanum()) {
          i += 1;
        }
      }
      val attribsEnd = i;
      
      var lines_ = 0;
      if (lookingAt('|')) {
        i += 1;
        lines_ = readAlphanum();
      }
      
      if (lookingAt('?')) {
        return new { val opcode = "?"; }
      }
      if (! (lookingAt('+') || lookingAt('-') || lookingAt('='))) {
        throw OpParseError;
      }
      val opcode_ = str.substring(i, i+1);
      i += 1;
      val chars_ = readAlphanum();

      return new Op(opcode_, chars_, lines_, str.substring(startIndex, attribsEnd)) {
        val lastIndex = i;
      };
    }
    catch { case OpParseError => null }
  }

  case class Op(var opcode: String, var chars: Int, var lines: Int, var attribs: String);
  def newOp() = Op("", 0, 0, "");
  def clearOp(op: Op) { op.opcode = ""; op.chars = 0; op.lines = 0; op.attribs = ""; }
  
  // ported from easysync2.js
  class MergingOpAssembler {
    val assem = opAssembler();
    var bufOp = newOp();

    var bufOpAdditionalCharsAfterNewline = 0;

    def flush(isEndDocument: Boolean) {
      if (bufOp.opcode.length > 0) {
        if (isEndDocument && bufOp.opcode == "=" && bufOp.attribs.length == 0) {
          // final merged keep, leave it implicit
        }
        else {
          assem.append(bufOp);
          if (bufOpAdditionalCharsAfterNewline > 0) {
            bufOp.chars = bufOpAdditionalCharsAfterNewline;
            bufOp.lines = 0;
            assem.append(bufOp);
            bufOpAdditionalCharsAfterNewline = 0;
          }
        }
        bufOp.opcode = "";
      }
    }
    def append(opcode: String, chars: Int, lines: Int, attribs: String) {
      if (chars > 0) {
        if (bufOp.opcode == opcode && bufOp.attribs == attribs) {
	  if (lines > 0) {
	    // bufOp and additional chars are all mergeable into a multi-line op
	    bufOp.chars += bufOpAdditionalCharsAfterNewline + chars;
	    bufOp.lines += lines;
	    bufOpAdditionalCharsAfterNewline = 0;
	  }
	  else if (bufOp.lines == 0) {
	    // both bufOp and op are in-line
	    bufOp.chars += chars;
	  }
	  else {
	    // append in-line text to multi-line bufOp
	    bufOpAdditionalCharsAfterNewline += chars;
	  }
        }
        else {
	  flush(false);
          bufOp = Op(opcode, chars, lines, attribs);
        }
      }
    }
    def endDocument() {
      flush(true);
    }
    override def toString() = {
      flush(false);
      assem.toString();
    }
    def clear() {
      assem.clear();
      clearOp(bufOp);
    }
  }

  def mergingOpAssembler() = new MergingOpAssembler();
}
