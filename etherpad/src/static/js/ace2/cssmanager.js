

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

function makeCSSManager(emptyStylesheetTitle) {
  var isEnabled = true;

  function getSheetByTitle(title) {
    var allSheets = document.styleSheets;
    for(var i=0;i<allSheets.length;i++) {
      var s = allSheets[i];
      if (s.title == title) {
        return s;
      }
    }
    return null;
  }

  /*function getSheetTagByTitle(title) {
    var allStyleTags = document.getElementsByTagName("style");
    for(var i=0;i<allStyleTags.length;i++) {
      var t = allStyleTags[i];
      if (t.title == title) {
	return t;
      }
    }
    return null;
  }*/

  var browserSheet = getSheetByTitle(emptyStylesheetTitle);
  //var browserTag = getSheetTagByTitle(emptyStylesheetTitle);
  function browserRules() { return (browserSheet.cssRules || browserSheet.rules); }
  function browserDeleteRule(i) {
    if (browserSheet.deleteRule) browserSheet.deleteRule(i);
    else browserSheet.removeRule(i);
  }
  function browserInsertRule(i, selector, value) {
    if (!value) {
      if (browserSheet.insertRule) browserSheet.insertRule(selector+' {}', i);
      else browserSheet.addRule(selector, null, i);
    } else {
      var rule = selector+' {'+(value || "")+'}';
      if (browserSheet.insertRule) browserSheet.insertRule(rule, i);
      else browserSheet.addRule(selector, value, i);
    }
  }

  var selectorList = [];

  function indexOfSelector(selector) {
    for(var i=0;i<selectorList.length;i++) {
      if (selectorList[i] == selector) {
        return i;
      }
    }
    return -1;
  }

  function selectorStyle(selector, optStyle) {
    if (isEnabled) {
      var i = indexOfSelector(selector);
      if (i < 0) {
        // add selector
        browserInsertRule(0, selector, optStyle);
        selectorList.splice(0, 0, selector);
        i = 0;
      }

      return browserRules().item(i).style;
    } else {
      disabledSelectorStyle[selector] = {};
      return disabledSelectorStyle[selector];
    }
  }

  var disabledSelectorStyle = {};
  function disable() {
    while(selectorList.length) {
      disabledSelectorStyle[selectorList[0]] = selectorStyle(selectorList[0]);
      removeSelectorStyle(selectorList[0]);
    }
    isEnabled = false;
  }

  function isEnabled_() {
    return isEnabled;
  }

  function enable() {
    isEnabled = true;
    for(var selector in disabledSelectorStyle) {
      var cssText = disabledSelectorStyle[selector].cssText;
      if (cssText) {
        selectorStyle(selector, String(cssText));
      } else {
        var style = selectorStyle(selector);
        for (k in disabledSelectorStyle[selector]) {
          if (disabledSelectorStyle[selector][k]) {
            style[k] = disabledSelectorStyle[selector][k];
          }
        }
      }
      delete disabledSelectorStyle[selector];
    }
  }

  function removeSelectorStyle(selector) {
    if (isEnabled) {
      var i = indexOfSelector(selector);
      if (i >= 0) {
        browserDeleteRule(i);
        selectorList.splice(i, 1);
      }
    } else {
      disabledSelectorStyle[selector];
    }
  }

  return {
    selectorStyle:selectorStyle,
    removeSelectorStyle:removeSelectorStyle,
    disable: disable,
    enable: enable,
    isEnabled: isEnabled_,
	  info: function() {
	    return selectorList.length+":"+browserRules().length;
	  }
  };
}


