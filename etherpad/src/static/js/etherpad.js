/*!
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

$(document).ready(function() {
  etherpad.deobfuscateEmails();

  $('input[placeholder]').placeholder();

  if (padmodals) {
    padmodals.initFeedback();
  }

});

etherpad = {};

//----------------------------------------------------------------
// general utils
//----------------------------------------------------------------

etherpad.validEmail = function(x) {
  return (x.length > 0 &&
	  x.match(/^[\w\.\_\+\-]+\@[\w\_\-]+\.[\w\_\-\.]+$/));
};

etherpad.doOnceCallbacks = {};
etherpad.doOnce = function (label, callback) {
  if (!etherpad.doOnceCallbacks[label]) {
    etherpad.doOnceCallbacks[label] = true;
    callback();
  }
}


//----------------------------------------------------------------
// obfuscating emails
//----------------------------------------------------------------

etherpad.deobfuscateEmails = function() {
  $("a.obfuscemail").each(function() {
    $(this).html($(this).html().replace('e***rp*d','hackpad'));
    this.href = this.href.replace('e***rp*d','hackpad');
  });
};

var didLogError = false;
etherpad.logError = function(message, file, line, column, errorObj) {
  // Don't overwhelm the server if it's an error that happens a lot.
  if (didLogError) {
    return;
  }
  didLogError = true;

	var img = new Image();
	img.src = '/ep/api/errors?' + $.param({
    random: Math.random(),  // break any possible caching
    context: navigator.userAgent,
    message: message,
    file: file,
    line: line,
    column: column,
    url: window.location.href,
    errorObj: errorObj ? errorObj.stack : ''
  });
}

$.fn.refresh = function (callback) {
  return this.each(function () {
    $(this).load($(this).attr('src'), {}, function () {
      $(this).children().unwrap();
      if (callback) {
        return callback();
      }
    });
  });
};


