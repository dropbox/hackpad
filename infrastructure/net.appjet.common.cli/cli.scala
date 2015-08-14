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

package net.appjet.common.cli;

import org.apache.commons.lang.WordUtils;

class CliOption(val name: String, val description: String, val argName: Option[String]);

class ParseException(message: String) extends RuntimeException(message);

class CliParser(predef: Array[CliOption]) {
  val displayWidth = 80;
  val options = Map((for (opt <- predef) yield ((opt.name, opt))): _*);

  def parseOptions(args0: Array[String]): (Map[String, String], Array[String]) = {
    val (opts, args) = args0.partition(_.startsWith("-"));
    (Map((for (arg <- opts) yield {
      val parts = arg.split("=", 2);
      val name = "-+".r.replaceFirstIn(parts(0), "");
      if (parts.length == 1 && options.get(name).map(_.argName.isDefined).exists(x => x))
	throw new ParseException("Missing argument for flag: "+name);
      (name, parts.orElse(Map(1 -> "true"))(1));
    }): _*),
     args.toArray);
  }

  def dprint(prefix: String, value: String) = {
//    println(prefix+": "+value+"\n");
    value;
  }

  def usage = {
    val sb = new StringBuilder();
    var maxLength = predef.map(opt => 2 + opt.name.length + opt.argName.map(_.length + 1).getOrElse(0) ).reduceRight(math.max)+2;
    for ((n, opt) <- options) {
      sb.append("  --"+n+opt.argName.map("=<"+_+">").getOrElse("")+"\n");
      sb.append("     "+WordUtils.wrap(opt.description, displayWidth-5).split("\n").mkString("\n     "));
      sb.append("\n\n");
    }
    sb.toString();
  }
}
