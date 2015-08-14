// Adopted from https://github.com/felixge/node-measured

// Time units, as found in Java:
// see: http://download.oracle.com/javase/6/docs/api/java/util/concurrent/TimeUnit.html
var units = {};
units.NANOSECONDS  = 1 / (1000 * 1000);
units.MICROSECONDS = 1 / 1000;
units.MILLISECONDS = 1;
units.SECONDS      = 1000 * units.MILLISECONDS;
units.MINUTES      = 60 * units.SECONDS;
units.HOURS        = 60 * units.MINUTES;
units.DAYS         = 24 * units.HOURS;

function ExponentiallyMovingWeightedAverage(timePeriod, tickInterval) {
  this._timePeriod   = timePeriod || 1 * units.MINUTE;
  this._tickInterval = tickInterval || ExponentiallyMovingWeightedAverage.TICK_INTERVAL;
  this._alpha        = 1 - Math.exp(-this._tickInterval / this._timePeriod);
  this._count        = 0;
  this._rate         = 0;
}
ExponentiallyMovingWeightedAverage.TICK_INTERVAL = 5 * units.SECONDS;

ExponentiallyMovingWeightedAverage.prototype.update = function(n) {
  this._count += n;
};

ExponentiallyMovingWeightedAverage.prototype.tick = function() {
  var instantRate = this._count / this._tickInterval;
  this._count     = 0;

  this._rate += (this._alpha * (instantRate - this._rate));
};

ExponentiallyMovingWeightedAverage.prototype.rate = function(timeUnit) {
  return (this._rate || 0) * timeUnit;
};

var EWMA  = ExponentiallyMovingWeightedAverage;

function Meter(properties) {
  properties = properties || {};

  this._rateUnit     = properties.rateUnit || Meter.RATE_UNIT;
  this._tickInterval = properties.tickInterval || Meter.TICK_INTERVAL;

  this._m1Rate     = new EWMA(1 * units.MINUTES, this._tickInterval);
  this._m5Rate     = new EWMA(5 * units.MINUTES, this._tickInterval);
  this._m15Rate    = new EWMA(15 * units.MINUTES, this._tickInterval);
  this._h1Rate    = new EWMA(units.HOURS, this._tickInterval);
  this._count      = 0;
  this._currentSum = 0;
  this._lastToJSON = null
  this._interval   = null;
  this._startTime  = null;
}

Meter.RATE_UNIT     = units.SECONDS;
Meter.TICK_INTERVAL = 20 * units.SECONDS;

Meter.prototype._catchup = function() {
  var missedTicks = Math.floor((Date.now() - this._lastTick)/Meter.TICK_INTERVAL);
  if (missedTicks * Meter.TICK_INTERVAL > 90 * units.MINUTES) {
    // too far behind, just reset the meter
    this._m1Rate     = new EWMA(1 * units.MINUTES, this._tickInterval);
    this._m5Rate     = new EWMA(5 * units.MINUTES, this._tickInterval);
    this._m15Rate    = new EWMA(15 * units.MINUTES, this._tickInterval);
    this._h1Rate    = new EWMA(units.HOURS, this._tickInterval);
  } else {
    for (var i=0; i<missedTicks; i++) {
      this._tick();
    }
  }
  this._lastTick = this._lastTick + missedTicks * Meter.TICK_INTERVAL;
}

Meter.prototype.mark = function(n) {
  if (!this._interval) this.start();

  this._catchup();

  n = n || 1;

  this._count += n;
  this._currentSum += n;
  this._m1Rate.update(n);
  this._m5Rate.update(n);
  this._m15Rate.update(n);
  this._h1Rate.update(n);
};

Meter.prototype.start = function() {
  this._lastTick = Date.now();
  this._interval   = true; //setInterval(this._tick.bind(this), Meter.TICK_INTERVAL);
  this._startTime  = Date.now();
  this._lastToJSON = Date.now();
};

Meter.prototype.end = function() {
  //clearInterval(this._interval);
};

Meter.prototype._tick = function() {
  this._m1Rate.tick();
  this._m5Rate.tick();
  this._m15Rate.tick();
  this._h1Rate.tick();
};

Meter.prototype.reset = function() {
  this.end();
  this.constructor.call(this);
};

Meter.prototype.meanRate = function() {
  if (this._count === 0) return 0;

  this._catchup();

  var elapsed = Date.now() - this._startTime;
  return this._count / elapsed * this._rateUnit;
};

Meter.prototype.currentRate = function() {
  this._catchup();

  var currentSum  = this._currentSum;
  var duration    = Date.now() - this._lastToJSON;
  var currentRate = currentSum / duration * this._rateUnit;

  this._currentSum = 0;
  this._lastToJSON = Date.now();

  // currentRate could be NaN if duration was 0, so fix that
  return currentRate || 0;
};

Meter.prototype.toJSON = function() {
  this._catchup();

  return {
    'mean'         : this.meanRate(),
    'count'        : this._count,
    'currentRate'  : this.currentRate(),
    '1MinuteRate'  : this._m1Rate.rate(this._rateUnit),
    '5MinuteRate'  : this._m5Rate.rate(this._rateUnit),
    '15MinuteRate' : this._m15Rate.rate(this._rateUnit),
    '1HourRate' : this._h1Rate.rate(this._rateUnit),
  };
};