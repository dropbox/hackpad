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

import("faststatic");
import("dispatch.{Dispatcher,PrefixMatcher,forward}");

import("etherpad.utils.*");
import("etherpad.globals.*");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pad.padutils");

function onRequest() {
  var staticBase = '/static';

  var opts = {cache: isProduction()};
  var serveCompressed = faststatic.compressedFileServer(opts);

  var disp = new Dispatcher();
  disp.addLocations([
    ['/favicon.ico', faststatic.singleFileServer(staticBase + '/favicon.ico', opts)],
    ['/static/favicon.png', faststatic.singleFileServer(staticBase + '/favicon.png', opts)],
    ['/static/fbchannel.html', faststatic.singleFileServer(staticBase + '/fbchannel.html', opts)],
    ['/static/hackpad.js', faststatic.singleFileServer(staticBase + '/hackpad.js', opts)],
    ['/static/LICENSE', faststatic.singleFileServer(staticBase + '/LICENSE', opts)],
    ['/static/iphone-arrow-10x13.png', faststatic.singleFileServer(staticBase + '/iphone-arrow-10x13.png', opts)],
    ['/static/privacy.html', faststatic.singleFileServer(staticBase + '/privacy.html', opts)],
    ['/static/sparkle.xml', faststatic.singleFileServer(staticBase + '/sparkle.xml', opts)],
    ['/static/tos.html', faststatic.singleFileServer(staticBase + '/tos.html', opts)],
    ['/static/xhrXdFrame.js', faststatic.singleFileServer(staticBase + '/xhrXdFrame.js', opts)],
    [/\/apple\-touch\-icon(\-\d+x\d+)?.png/, render404],
    [/\/apple\-touch\-icon(\-\d+x\d+)?\-precomposed.png/,  faststatic.singleFileServer(staticBase + '/apple-touch-icon-precomposed.png', opts)],
    ['/robots.txt', serveRobotsTxt],
    ['/humans.txt', render404],
    ['/sitemapindex.xml', serveSitemapIndexXml],
    ['/sitemap.xml', serveSitemapXml],
    ['/static/opensearch.xml', serveOpensearchXml],
    [/\/sitemap\-([\w-]+)\.xml/, serveSitemapXml],
    ['/crossdomain.xml', faststatic.singleFileServer(staticBase + '/crossdomain.xml', opts)],
    ['/cache.manifest', serveCacheManifest],
    [PrefixMatcher('/static/compressed/'), serveCompressed]])

  var staticSubDirs = {'app': 0, 'css/hpfont': 0, 'js/tok': 0, 'fonts':0, 'img':0, 'swf':0};
  if (!isProduction()) {
    staticSubDirs['js'] = 0;
    staticSubDirs['css'] = 0;
  }

  for (fmt in staticSubDirs) {
    disp.addLocations([[PrefixMatcher('/static/'+fmt+'/'), faststatic.directoryServer(staticBase+'/'+fmt+'/', opts)]]);
  }

  return disp.dispatch();
}


function _failOnCometHost() {
  if (request.host.indexOf("comet.") > -1) {
    render404();
  }
}

function serveRobotsTxt(name) {
  _failOnCometHost();

  response.neverCache();
  response.setContentType('text/plain');
  response.write('User-agent: *\n');
  if (domains.isPrimaryDomainRequest()) {
    response.write('Sitemap: ' + request.scheme + '://' + request.host + '/sitemapindex.xml\n');
  } else if (domains.isPublicDomain()) {
    response.write('Sitemap: ' + request.scheme + '://' + appjet.config['etherpad.canonicalDomain'] + '/sitemap-' + domains.getRequestDomainRecord().subDomain + '.xml\n');
  }
  if (!isProduction()) {
    response.write('Disallow: /\n');
  }
  response.stop();
  return true;
}

function serveSitemapXml(subDomain) {
  _failOnCometHost();

  response.neverCache();
  response.setContentType('text/xml; charset=utf-8');

  // don't response to x.hackpad.com/sitemap-y.xml
  if (subDomain && !domains.isPrimaryDomainRequest()) {
    return render404();
  }

  // load the domain record
  var subDomainId;
  if (subDomain) {
    var domainRecord = domains.getDomainRecordFromSubdomain(subDomain);
    if (domainRecord) {
      subDomainId = domainRecord.id;
    } else {
      // deleted domain probably
      return render404();
    }
  } else {
    subDomainId = domains.getRequestDomainId();
  }

  function _url(path, lastmod) {
    var d = lastmod.getDate();
    var m = lastmod.getMonth()+1;
    var y = lastmod.getFullYear();
    return {
      url: request.scheme + '://' + (subDomain ? subDomain + "." : "") + request.host + path,
      lastmod: y +'-'+ (m<=9?'0'+m:m) +'-'+ (d<=9?'0'+d:d)
    };
  }

  // no sitemaps for private sites.
  if (!domains.isPublicDomain(subDomainId) && domains.getPrimaryDomainId() != subDomainId) {
    response.sendError(403, "Unavailable");
  }

  var latestDate;
  var urls = pro_pad_db.listPublicPads(10000, null, subDomainId).filter(function(p) {
    return p.lastEditedDate != null;
  }).map(function(p) {
    var urlTitle = p.title.replace(/[^\w\s-\.]/g, '').replace(/[\s-]+/g, '-');
    urlTitle = urlTitle ? urlTitle + '-' + p.localPadId : p.localPadId;

    if (!latestDate || p.lastEditedDate > latestDate) {
      latestDate = p.lastEditedDate;
    }
    return _url("/" + urlTitle, p.lastEditedDate);
  });

  // it's invalid to have an empty sitemap.xml
  urls.push(_url("/", latestDate || new Date()));

  response.write(renderTemplateAsString("sitemap.xml", { urls: urls }));
  return true;
}

function serveSitemapIndexXml() {
  _failOnCometHost();

  response.neverCache();
  response.setContentType('text/xml; charset=utf-8');

  if (!domains.isPrimaryDomainRequest()) {
    return render404();
  }

  var now = new Date();
  var d = now.getDate();
  var m = now.getMonth()+1;
  var y = now.getFullYear();

  // list all public domains
  var sitemaps = domains.listPublicDomains().map(function(domainId) {
    var subDomain = domains.getDomainRecord(domainId).subDomain;
    return {
      url: request.scheme + '://' + request.host + "/sitemap-" + subDomain + ".xml",
      lastmod: y +'-'+ (m<=9?'0'+m:m) +'-'+ (d<=9?'0'+d:d)
    };
  });

  sitemaps.push({
    url: request.scheme + '://' + request.host + "/sitemap.xml",
    lastmod: y +'-'+ (m<=9?'0'+m:m) +'-'+ (d<=9?'0'+d:d)
  });

  response.write(renderTemplateAsString("sitemapindex.xml", { sitemaps: sitemaps }));
  return true;
}


function serveOpensearchXml() {
  _failOnCometHost();

  response.setContentType('text/xml; charset=utf-8');

  response.write(renderTemplateAsString("opensearch.xml", { host: request.host }));
  return true;
}


function serveCacheManifest() {
  response.neverCache();
  response.setContentType('text/cache-manifest');
  response.write("CACHE MANIFEST\n");
  response.write("# revision 2\n");
  response.write("NETWORK:\n*\n");
  response.write("CACHE:\n");

  if (!isProduction()) {
    //response.write("# force reload " +(new Date()) + "\n");
  }

  var allResources = [];

  // TODO:
  // cache url for facebook all.js
  // cache url for facebook images?

  function _writePaths(paths, prefix) {
    for (var i in paths) {
      allResources.push((prefix ? prefix : "") + paths[i]);
    }
  }

  // write any compressed js/css paths
  _writePaths(faststatic.getAllCompressedFileKeys(), "/static/compressed/");

  // any static files served so far
  _writePaths(faststatic.getAllStaticFiles());

  function _writePadPaths(padList) {
    for (var i in padList) {
      allResources.push('/' + padList[i].localPadId);
    }
  }

  if (getSessionProAccount()) {
    /*
      Disabling for now. Large file lists make offline mode unusable.
    */
    // list my pads
    //_writePadPaths(pro_pad_db.listMyPads());
    // list friends pads
    //_writePadPaths(pro_pad_db.listAccessiblePads());
  }

  // uniqify and sort all offline resources
  var uniq = [];
  allResources.forEach(function(item) {
    if (uniq.indexOf(item) == -1) {
        uniq.push(item);
    }
  });
  uniq.sort();
  response.write(uniq.join("\n") + "\n");

  return true;
}
