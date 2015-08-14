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

package net.appjet.oui;

class NoninheritedDynamicVariable[T](init: T) {
  private val tl = new ThreadLocal[T] {
    override def initialValue = init.asInstanceOf[T with AnyRef]
  }

  /** Retrieve the current value */
  def value: T = tl.get.asInstanceOf[T]
  
   
  /** Set the value of the variable while executing the specified
    * thunk.
    *
    * @param newval The value to which to set the fluid
    * @param thunk The code to evaluate under the new setting
    */
  def withValue[S](newval: T)(thunk: =>S): S = {
    val oldval = value
    tl.set(newval)
  
    try { thunk } finally {
      tl.set(oldval)
    }
  }

  /** Change the currently bound value, discarding the old value.
    * Usually <code>withValue()</code> gives better semantics.
    */
  def value_=(newval: T) = { tl.set(newval) }
  
  override def toString: String = "NoninheritedDynamicVariable(" + value  +")"
}
