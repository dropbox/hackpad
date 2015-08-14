
import ("stringutils");
import("etherpad.log");
import ("etherpad.pad.model");
import ("etherpad.pro.pro_accounts");
import ("etherpad.pro.pro_config");
import ("etherpad.pro.domains");
import ("etherpad.testing.mock_browser.MockBrowser");
//import ("etherpad.testing.unit_tests.");
import("etherpad.collab.collab_server");
import("etherpad.pad.dbwriter");
import("etherpad.pro.pro_pad_editors");

import("etherpad.testing.testutils.*");


function _url(subdomain, path) {
  var urlPrefix = appjet.config.useHttpsUrls ? "https://" : "http://";
  return urlPrefix + (subdomain ? subdomain + ".": "") + appjet.config['etherpad.canonicalDomain'] + path;
}

function run() {


  var browser = new MockBrowser();

  var privateDomainSitemap = _url(privateDomainRecord().subDomain, "/" + "sitemap.xml");
  assertTruthy(browser.get(privateDomainSitemap).status != 200);

  var publicDomainSitemap = _url(publicDomainRecord().subDomain, "/" + "sitemap.xml");
  assertTruthy(browser.get(publicDomainSitemap).status == 200);

  var mainSitemap = _url(null, "/" + "sitemap.xml");
  assertTruthy(browser.get(mainSitemap).status == 200);

}