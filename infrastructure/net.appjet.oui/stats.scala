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

import java.util.Date;

import scala.collection.mutable.{HashMap, HashSet, Set, Map, ArrayBuffer};
import scala.util.Sorting;

trait BucketMap extends scala.collection.mutable.Map[Int, BucketedLastHits] {
  def t = 1000*60;
  override def apply(s: Int) = synchronized { getOrElseUpdate(s, new BucketedLastHits(t)) };
  def counts = mapValues(_.count)
}

abstract class BucketKeeper[A: ClassManifest, B: ClassManifest](val size: Long, val numbuckets: Int, val noUpdate: Boolean) {
  def this(size: Long, noUpdate: Boolean) =
    this(size, math.max(100, if (noUpdate) 1 else (size/60000).toInt), noUpdate)
  def this(size: Long) = this(size, false);

  val buckets = new Array[A](numbuckets);

  val millisPerBucket = size/numbuckets;
  var lastSwitch = System.currentTimeMillis();
  var currentBucket = 0;

  def withSyncUpdate[E](block: => E): E = synchronized {
    updateBuckets();
    block;
  }

  protected def bucketAtTime(d: Date) = {
    val msAgo = lastSwitch - d.getTime();
    val bucketsAgo = math.floor(msAgo/millisPerBucket).asInstanceOf[Int];
    if (bucketsAgo < numbuckets) {
      val bucket = (currentBucket - bucketsAgo + numbuckets) % numbuckets
      // println("Applying to old bucket: "+bucket+" / current: "+currentBucket+", old count: "+count);
      Some(bucket);
    } else {
      // println("No bucket found for: "+d);
      None;
    }
  }

  protected def updateBuckets(): Unit = {
    if (! noUpdate) {
      val now = System.currentTimeMillis();
      while (now > lastSwitch + millisPerBucket) {
        lastSwitch += millisPerBucket;
        currentBucket = (currentBucket + 1) % numbuckets;
        bucketClear(currentBucket);
      }
    }
  }

  protected def bucketClear(index: Int);
  protected def bucketsInOrder: Seq[A] =
    buckets.slice((currentBucket+1)%numbuckets, numbuckets) ++
    buckets.slice(0, currentBucket)

  def mergeBuckets(b: Seq[A]): B;

  def history(bucketsPerSample: Int, numSamples: Int): Array[B] = withSyncUpdate {
    val bseq = bucketsInOrder.reverse.take(bucketsPerSample*numSamples);
    val sampleCount = math.min(numSamples, bseq.length);
    val samples =
      for (i <- 0 until sampleCount) yield {
        mergeBuckets(bseq.slice(i*bucketsPerSample, (i+1)*bucketsPerSample));
      }
    samples.reverse.toArray;
  }
  def latest(bucketsPerSample: Int): B = history(bucketsPerSample, 1)(0);
  def count: B = withSyncUpdate { mergeBuckets(buckets); }

  for (i <- 0 until numbuckets) {
    bucketClear(i);
  }
}

class BucketedUniques(size: Long, noUpdate: Boolean)
extends BucketKeeper[Set[Any], Int](size, noUpdate) {
  def this(size: Long) = this(size, false);

  override protected def bucketClear(index: Int): Unit = {
    buckets(index) = new HashSet[Any];
  }

  override def mergeBuckets(b: Seq[Set[Any]]) = {
    b.foldLeft(scala.collection.immutable.Set[Any]())(_ ++ _).size;
  }

  def hit(d: Date, value: Any): Unit = withSyncUpdate {
    for (bucket <- bucketAtTime(d)) {
      buckets(bucket) += value;
    }
  }
}

// Similar to BucketedUniques, but is aware of group membership
// and returns a Map groupId => count of uniques
class BucketedGroupedUniques(size: Long, noUpdate: Boolean)
extends BucketKeeper[HashMap[Int, Int], Map[Int, Int]](size, noUpdate) {
  def this(size: Long) = this(size, false);

  override protected def bucketClear(index: Int): Unit = {
    buckets(index) = new HashMap[Int, Int];
  }

  override def mergeBuckets(b: Seq[HashMap[Int, Int]]) = {
    val summary = new HashMap[Int, Int];
    for (m <- b) {
      for ((k, v) <- m) {
        summary(k) = v;
      }
    }
    val counts = new HashMap[Int, Int];
    for ((k,v) <- summary) {
      counts(v) = counts.getOrElse(v, 0) + 1;
    }
    counts;
  }

  def hit(d: Date, key: Int, value: Int): Unit = withSyncUpdate {
    for (bucket <- bucketAtTime(d)) {
      buckets(bucket)(key) = value;
    }
  }
}

class BucketedValueCounts(size: Long, noUpdate: Boolean)
extends BucketKeeper[HashMap[String, Int], (Int, Map[String, Int])](size, noUpdate) {
  def this(size: Long) = this(size, false);

  override protected def bucketClear(index: Int): Unit = {
    buckets(index) = new HashMap[String, Int];
  }

  override def mergeBuckets(b: Seq[HashMap[String, Int]]) = {
    val out = new HashMap[String, Int];
    var total = 0;
    for (m <- b) {
      for ((k, v) <- m) {
        out(k) = out.getOrElse(k, 0) + v;
        total += v;
      }
    }
    (total, out);
  }

  def hit(d: Date, value: String, increment: Int): Unit = withSyncUpdate {
    for (bucket <- bucketAtTime(d)) {
      buckets(bucket)(value) =
        buckets(bucket).getOrElse(value, 0)+increment;
    }
  }

  def hit(d: Date, value: String): Unit = hit(d, value, 1);
}


/**
 * Keeps track of how many "hits" in the last size milliseconds.
 * Has granularity speicified by numbuckets.
 */
class BucketedLastHits(size: Long, noUpdate: Boolean)
extends BucketKeeper[Int, Int](size, noUpdate) {
  def this(size: Long) = this(size, false);

  override protected def bucketClear(index: Int): Unit = {
    buckets(index) = 0;
  }

  override def mergeBuckets(b: Seq[Int]) = {
    b.foldRight(0)(_+_);
  }

  def hit(d: Date): Unit = hit(d, 1);
  def hit(d: Date, n: Int): Unit = withSyncUpdate {
    for (bucket <- bucketAtTime(d)) {
      buckets(bucket) = buckets(bucket) + n;
    }
  }
}

class BucketedLastHitsHistogram(size: Long, noUpdate: Boolean)
extends BucketKeeper[ArrayBuffer[Int], Function1[Float, Int]](size, noUpdate) {
  def this(size: Long) = this(size, false);

  override protected def bucketClear(index: Int): Unit = {
    buckets(index) = new ArrayBuffer[Int];
  }

  // elements will end up sorted.
  protected def histogramFunction(elements: Array[Int]): Function1[Float, Int] = {
    Sorting.quickSort(elements);
    (percentile: Float) => {
      if (elements.length == 0) {
        0
      } else {
        elements(
          math.round(percentile/100.0f*(elements.length-1)));
      }
    }
  }

  override def mergeBuckets(b: Seq[ArrayBuffer[Int]]) = {
    val elements = new Array[Int](b.foldRight(0)(_.size + _));
    var currentIndex = 0;
    for (bucket <- b if bucket.length > 0) {
      // copyToArray is broken through scala 2.7.5, fixed in trunk.
      // bucket.copyToArray(allElements, currentIndex);
      val bucketArray = bucket.toArray;
      System.arraycopy(bucketArray, 0, elements, currentIndex, bucketArray.length);
      currentIndex += bucket.size
    }
    histogramFunction(elements);
  }

  def hit(d: Date): Unit = hit(d, 1);
  def hit(d: Date, n: Int): Unit = withSyncUpdate {
    for (bucket <- bucketAtTime(d)) {
      buckets(bucket) += n;
    }
  }
}





object appstats {
  val minutelyStatus = new HashMap[Int, BucketedLastHits] with BucketMap;
  val hourlyStatus = new HashMap[Int, BucketedLastHits] with BucketMap { override val t = 1000*60*60 };
  val dailyStatus = new HashMap[Int, BucketedLastHits] with BucketMap { override val t = 1000*60*60*24 };
  val weeklyStatus = new HashMap[Int, BucketedLastHits] with BucketMap { override val t = 1000*60*60*24*7 };
  val stati = Array(minutelyStatus, hourlyStatus, dailyStatus, weeklyStatus);
}
