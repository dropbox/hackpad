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

jimport("java.util.concurrent.locks.ReentrantLock");
jimport("net.appjet.oui.GlobalSynchronizer");

/**
 * synchronously calls a no-argument function.
 * f may have return values.
 */
function callsync(obj, f) {
  if (!obj._LOCK) {
    try {
      appjet.globalLock.lock();
      if (! obj._LOCK) {
        obj._LOCK = new ReentrantLock();
      }
    } finally {
      appjet.globalLock.unlock();
    }
  }
  try {
    obj._LOCK.lock();
    return f();
  } finally {
    obj._LOCK.unlock();
  }
}

/** 
 * synchronously calls a no-argument function iff
 * condition() is true. condition may be called 
 * twice and shouldn't have side-effects.
 */
function callsyncIfTrue(obj, condition, f) {
  if (condition()) {
    callsync(obj, function() {
      if (condition()) {
        f();
      }
    });
  }
}

/**
 * returns a function that synchronously calls
 * f with its own arguments
 */
function wrapsync(obj, f, thisArg) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var wrapper = function() {
      return f.apply(thisArg, args);
    }
    callsync(obj, wrapper);
  }
}

function doWithStringLock(lockName, fn) {
  GlobalSynchronizer.acquire(lockName);
  try {
    return fn();
  }
  finally {
    GlobalSynchronizer.release(lockName);
  }
}

