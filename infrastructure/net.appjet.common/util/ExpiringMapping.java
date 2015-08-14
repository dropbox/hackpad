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

package net.appjet.common.util;

import java.util.*;

// this class is synchronized

public class ExpiringMapping<K,V> {

  private Map<K,TimeStampedValue> keyToValue =
    new HashMap<K,TimeStampedValue>();
  private SortedMap<Long,K> timeToKey= new TreeMap<Long,K>();
  
  private long lastTimeStamp = 0;

  private ExpiryPolicy policy;
  
  public ExpiringMapping(final long maxAgeMillis) {
    this(new ExpiryPolicy() {
        public boolean hasExpired(long timeStamp, long now, int rank) {
          return now - timeStamp > maxAgeMillis;
        }
      });
  }
  
  protected ExpiringMapping(ExpiryPolicy policy) {
    this.policy = policy;
  }
  
  public synchronized void clear() {
    keyToValue.clear();
    timeToKey.clear();
  }
  
  public synchronized void put(K key, V value) {
    TimeStampedValue old = keyToValue.get(key);
    if (old != null) {
      timeToKey.remove(old.getTimeStamp());
    }
    TimeStampedValue newVal = new TimeStampedValue(value);
    keyToValue.put(key, newVal);
    timeToKey.put(newVal.getTimeStamp(), key);
    checkExpiry();
  }

  public synchronized void touch(K key) {
    TimeStampedValue old = keyToValue.get(key);
    if (old != null) {
      put(key, old.getValue());
    }
  }
  
  public synchronized void remove(Object key) {
    TimeStampedValue old = keyToValue.get(key);
    if (old != null) {
      keyToValue.remove(key);
      timeToKey.remove(old.getTimeStamp());
    }
  }

  // doesn't "touch" key or trigger expiry of expired items
  public synchronized V get(Object key) {
    if (keyToValue.containsKey(key)) {
      return keyToValue.get(key).getValue();
    } else {
      return null;
    }
  }

  public synchronized boolean containsKey(Object key) {
    return keyToValue.containsKey(key);
  }

  public synchronized void checkExpiry() {
    while (timeToKey.size() > 0) {
      long oldestTime = timeToKey.firstKey();
      if (hasExpired(oldestTime, timeToKey.size())) {
        remove(timeToKey.get(oldestTime));
      }
      else {
        break;
      }
    }
  }

  // lists keys in time order, oldest to newest
  public synchronized List<K> listAllKeys() {
    List<K> keyList = new java.util.ArrayList<K>(timeToKey.size());
    for(Map.Entry<Long,K> entry : timeToKey.entrySet()) {
      keyList.add(entry.getValue());
    }
    return Collections.unmodifiableList(keyList);
  }
  
  // result must be monotonic
  private boolean hasExpired(long time, int rank) {
    return policy.hasExpired(time, System.currentTimeMillis(), rank);
  }
  
  private long nowTimeStamp() {
    // return "now", but unique
    long now = System.currentTimeMillis();
    if (now <= lastTimeStamp) {
      now = lastTimeStamp+1;
    }
    lastTimeStamp = now;
    return now;
  }
    
  private class TimeStampedValue {
    private final V value;
    private long timeStamp;
    private TimeStampedValue(V value) {
      this(value, nowTimeStamp());
    }
    private TimeStampedValue(V value, long timeStamp) {
      this.value = value; this.timeStamp = timeStamp;
    }
    public void setTimeStamp(long ts) {
      timeStamp = ts;
    }
    public long getTimeStamp() {
      return timeStamp;
    }
    public V getValue() {
      return value;
    }
    public String toString() {
      return "("+value+", "+new Date(timeStamp)+")";
    }
  }

  public synchronized String toString() {
    return keyToValue.toString();
  }

  protected interface ExpiryPolicy {
    // result must be monotonic wrt timeStamp given now
    boolean hasExpired(long timeStamp, long now, int rank);
  }

}

  /*private static int compareLongs(long a, long b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
    }*/
