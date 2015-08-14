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

$(function() {
  $('.title').click(function() {
    var id = $(this).parent().attr("id")
    toggleId(id);
    // $(this).parent().children('.statbody').toggle();
  });
  $('.statbody').each(function() {
    if (isVisible($(this).parent().attr("id"))) {
      $(this).show();
    }
  });
  var cat = window.location.hash.slice(1);
  if (! cat) {
    cat = "health";
  }
  $('.navlink').click(function() {
    var cat = $(this).attr("id").slice(4);
    showCategory(cat);
  });
  showCategory(cat);
});


function showCategory(cat) {
  $('#fragment').val(cat);
  $('.categorywrapper').each(function() {
    var localCat = $(this).attr("id").slice(3);
    if (localCat == cat) {
      $('#link'+localCat).parent().addClass("selected");
      $(this).show();
    } else {
      $('#link'+localCat).parent().removeClass("selected");
      $(this).hide();
    }
  })
}

function formChanged() {
  document.getElementById("statprefs").submit();
}

if (! String.prototype.startsWith) {
  String.prototype.startsWith = function(s) {
    if (this.length < s.length) { return false; }
    return this.substr(0, s.length) == s;
  }
}

if (! String.prototype.trim) {
  String.prototype.trim = function() {
    var firstNonSpace;
    for (var i = 0; i < this.length; ++i) {
      if (this[i] != ' ') {
        firstNonSpace = i;
        break;
      }
    }
    var s = this;
    if (firstNonSpace) {
      s = this.substr(firstNonSpace);
    }
    var lastNonSpace;
    for (var i = this.length-1; i >= 0; --i) {
      if (this[i] != ' ') {
        lastNonSpace = i;
        break;
      }
    }
    if (lastNonSpace !== undefined) {
      s = s.substr(0, lastNonSpace+1);
    }
    return s;
  }
}

if (! Array.prototype.contains) {
  Array.prototype.contains = function(obj) {
    for (var i = 0; i < this.length; ++i) {
      if (this[i] == obj) return true;
    }
    return false;
  }
}

if (! Array.prototype.first) {
  Array.prototype.first = function(f) {
    for (var i = 0; i < this.length; ++i) {
      if (f(this[i])) {
        return this[i];
      }
    }
  }
}

var cookieprefix = "visiblestats="

function statsCookieValue() {
  return (document.cookie.split(";").map(function(s) { return s.trim() }).first(function(str) {
    return str.startsWith(cookieprefix);
  }) || cookieprefix).split("=")[1];
}

function isVisible(id) {
  var cookieValue = statsCookieValue();
  return ! (cookieValue.split("-").contains(id));
}

function rememberHidden(id) {
  if (! isVisible(id)) { return; }
  document.cookie = cookieprefix+
    statsCookieValue().split("-").concat([id]).join("-");
}

function rememberVisible(id) {
  if (isVisible(id)) { return; }
  document.cookie = cookieprefix+
    statsCookieValue().split("-").filter(function(obj) { return obj != id }).join("-");
}

function toggleId(id) {
  var body = $('#'+id).children('.statbody');
  body.toggle();
  if (body.is(":visible")) {
    rememberVisible(id);
  } else {
    rememberHidden(id);
  }
}
