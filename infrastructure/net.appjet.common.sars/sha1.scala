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

package net.appjet.common.sars;

import java.io.UnsupportedEncodingException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
 
object SimpleSHA1 {
  private val chars = Map(0 -> '0', 1 -> '1', 2 -> '2', 3 -> '3', 4 -> '4', 5 -> '5', 6 -> '6', 7 -> '7',
			  8 -> '8', 9 -> '9', 10 -> 'a', 11 -> 'b', 12 -> 'c', 13 -> 'd', 14 -> 'e', 15 -> 'f');
  private def convertToHex(data: Array[Byte]): String = {
    val buf = new StringBuilder();
    for (b <- data) {
      buf.append(chars(b >>> 4 & 0x0F));
      buf.append(chars(b & 0x0F));
    }
    buf.toString();
  }
 
  def apply(text: String): String = {
    val md = MessageDigest.getInstance("SHA-1");
    md.update(text.getBytes("UTF-8"), 0, text.length());
    convertToHex(md.digest());
  }
}
