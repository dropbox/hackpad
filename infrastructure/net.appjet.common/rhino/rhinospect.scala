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

package net.appjet.common.rhino;

import java.lang.reflect.Modifier;

object rhinospect {

  def visitFields(obj: Object, func: (String,Any)=>Unit) {
    var cls: Class[_] = obj.getClass;

    if (cls.isArray) {
      import java.lang.reflect.Array;
      for(i <- 0 until Array.getLength(obj)) {
	func(String.valueOf(i), Array.get(obj, i));
      }
    }
    else {
      while (cls ne null) {
	for (f <- cls.getDeclaredFields) {
	  if (! Modifier.isStatic(f.getModifiers)) {
	    f.setAccessible(true);
	    val nm = f.getName;
	    val vl = f.get(obj);
	    func(nm, vl);
	  }
	}
	cls = cls.getSuperclass;
      }
    }
  }

  def dumpFields(obj: Object, depth: Int, prefix: String): String = {
    val s = new java.io.StringWriter();
    val out = new java.io.PrintWriter(s);
    visitFields(obj, (name: String, value: Any) => {
      out.printf("%30s: %s\n", name+prefix, String.valueOf(value));
      if (depth > 0 && value.isInstanceOf[Object]) {
	out.print(dumpFields(value.asInstanceOf[Object], depth-1, prefix+" --"));
      }
    });
    s.toString();
  }
}
