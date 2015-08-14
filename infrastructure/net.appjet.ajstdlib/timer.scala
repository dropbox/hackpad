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

package net.appjet.ajstdlib;

import scala.collection.mutable.{HashMap,ListBuffer};
import java.util.concurrent.locks.ReentrantLock;

object timer {

  var _timings = new HashMap[String,ListBuffer[Double]];
  var _lock = new ReentrantLock;
  var _callstack = new ThreadLocal[ListBuffer[String]];

  def start(opname: String) = {
    var _localcallstack = _callstack.get();
    if (_localcallstack == null) {
      _callstack.set(new ListBuffer[String]);
      _localcallstack = _callstack.get();
    }
    _localcallstack += opname;
    var _oplabel = _localcallstack.mkString(".");
    val startTime: Long = System.nanoTime();

    new {
      def done() {
	val elapsedTimeMs: Double = (System.nanoTime() - startTime) / 1.0e6;

	_lock.lock();
	try {
  	  var times = _timings.getOrElse(_oplabel, new ListBuffer[Double]);
	  /*
	  if (times.size > 100000) {
	    times = new ListBuffer[double];
	  }*/
	  times += elapsedTimeMs;
	  _timings.put(_oplabel, times);
	  _localcallstack.remove(_localcallstack.length-1);
	} finally {
  	  _lock.unlock();
	}
      }
    }
  }

  def getOpNames(): Array[String] = {
    _lock.lock();
    try {
      return _timings.keys.toList.toArray;
    } finally {
      _lock.unlock();
    }
  }

  def getStats(opname: String): Array[Double] = {
    _lock.lock();

    try {
      var times:ListBuffer[Double] = _timings(opname);
      var total = times.foldRight(0.0)(_ + _);
      return Array(times.size, total, (total / times.size));
    } finally {  
      _lock.unlock();
    }
  }

  def reset() {
    _lock.lock();
    _timings = new HashMap[String,ListBuffer[Double]];
    _lock.unlock();
  }
}
