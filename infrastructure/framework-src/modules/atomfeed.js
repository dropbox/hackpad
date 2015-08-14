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

import("stringutils.sprintf");
import("etherpad.helpers.escapeHtml");

// TODO: validate XHTML of entries?

function _xmlDate(d) {
  return sprintf("%04d-%02d-%02dT%02d:%02d:%02dZ",
    d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

// "entries" is an object with "forEach" member (an Array works).
// Each entry should have these properties:
//  * title
//  * author
//  * published (Date)
//  * updated (Date)
//  * href (URL for HTML version)
//  * content (valid xhtml)
//
// NOTE: entries should be sorted descending by entry.updated (newest first)
//

function renderFeed(title, lastUpdated, entries, href) {
  function ampesc(url) {
    return url.replace(/&/g, '&amp;');
  }

  var r = [];
  r.push('<?xml version="1.0" encoding="utf-8"?>',
	 '<feed xmlns="http://www.w3.org/2005/Atom">');

  r.push('<title type="text">' + escapeHtml(title) + '</title>');
  r.push('<updated>' + _xmlDate(lastUpdated) + '</updated>');
  r.push('<link rel="self" href="' + escapeHtml(request.url) + '" />');
  r.push('<link rel="alternate" type="text/html" href="' + escapeHtml(href) + '" />');
  r.push('<id>' + ampesc(request.url) + '</id>');

  entries.forEach(function(entry) {
    r.push('<entry>',
	   '<title>' + escapeHtml(entry.title) + '</title>',
	   '<author><name>' + escapeHtml(entry.author) + '</name></author>',
	   '<published>' + _xmlDate(entry.published) + '</published>',
	   '<updated>' + _xmlDate(entry.updated) + '</updated>',
	   '<link rel="alternate" type="text/html" href="' + escapeHtml(entry.href) + '" />',
	   '<id>'+ampesc(entry.href)+'</id>',
	   '<content type="xhtml">',
	   '<div xmlns="http://www.w3.org/1999/xhtml">'+escapeHtml(entry.content)+'</div>',
	   '</content>',
	   '</entry>');
  });

  r.push('</feed>');

  return r.join('\n');
}

