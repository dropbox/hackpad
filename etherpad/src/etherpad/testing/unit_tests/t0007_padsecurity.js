
import ("stringutils");
import("etherpad.log");
import ("jsutils.*");
import ("etherpad.pad.model");
import ("etherpad.pro.pro_accounts");
import ("etherpad.pro.pro_config");
import ("etherpad.pro.domains");
import ("etherpad.testing.testutils.*");
import ("etherpad.testing.mock_browser.MockBrowser");
import ("etherpad.testing.unit_tests.t0006_accounts");
import("etherpad.collab.collab_server");
import("etherpad.pad.dbwriter");
import("etherpad.pro.pro_pad_editors");
import("crypto");
import("etherpad.utils");
import("netutils");

function assert(condition, message) {
  if (!condition) {
    throw Error(message || "Assertion failed");
  }
}

function _url(subdomain, path) {
  var urlPrefix = appjet.config.useHttpsUrls ? "https://" : "http://";
  return urlPrefix + (subdomain ? subdomain + ".": "") + appjet.config['etherpad.canonicalDomain'] + path;
}


function run() {
  // Configuration
  var testPublicDomain = publicDomainRecord().subDomain;
  var testPrivateDomain = privateDomainRecord().subDomain;
  var testEmailAddy = "noreply+" + stringutils.randomString(10).toLowerCase() + "@hackpad.com";

  // very beginnings of a test suite for access control!
  var publicDomainId = publicDomainRecord().id;
  var privateDomainId = privateDomainRecord().id;
  pro_config.setConfigVal('defaultGuestPolicy', "domain", privateDomainId);

  pro_accounts.setApiProAccount(pro_accounts.getAccountById(1));

  // make a new mainsite pad
  // verify it's access control is link
  model.accessPadGlobal("1$"+stringutils.randomString(20), function(pad) {
    pad.create();
    assert(pad.getGuestPolicy() == "link");
  });

  // make a new public site pad
  var globalPadId  = publicDomainId + "$" + stringutils.randomString(20);
  model.accessPadGlobal(globalPadId, function(pad) {
    pad.create();
    assert(pad.getGuestPolicy() == "allow");
  });

  // make a new private site pad
  var localPadId = stringutils.randomString(20);
  model.accessPadGlobal(privateDomainId + "$" + localPadId, function(pad) {
    pad.create();
    assert(pad.getGuestPolicy() == "domain");
  });

  var browser = new MockBrowser();
  var padUrl = _url(testPrivateDomain, "/" + localPadId);
  assert (browser.get(padUrl).currentUrl.indexOf("/ep/account/sign-in")  != -1);

  // make a new private site pad with link access
  var localPadId = stringutils.randomString(20);
  pro_config.setConfigVal('defaultGuestPolicy', "link", privateDomainId);
  model.accessPadGlobal(privateDomainId + "$" + localPadId, function(pad) {
    pad.create("foo", "bar");
    collab_server.setPadText(pad, "foo");
    collab_server.setPadText(pad, "bar");
    pro_pad_editors.notifyEdit(privateDomainId, localPadId, 1, new Date(), "foo");
    pro_pad_editors.flushEditsNow(privateDomainId);
    assert(pad.getGuestPolicy() == "link");
  });

  model.accessPadGlobal(privateDomainId + "$" + localPadId, function(pad) {
    dbwriter.writePadNow(pad, true);
  });

  // assert that we can't see the pad w/out logging in
  var browser = new MockBrowser();
  browser.get(_url(testPrivateDomain, "/"))
  var padUrl = _url(testPrivateDomain, "/" + localPadId);
  assert (browser.get(padUrl).currentUrl.indexOf("/ep/account/sign-in")  != -1);

  // assert that we can see the pad after logging in
  var email = testEmailAddy;
  pro_accounts.createNewAccount(privateDomainId, email, email, "barbarbar", false, true, null /* fbid */, false/*guest*/);
  assert(t0006_accounts.attemptSignIn(testPrivateDomain, email, "barbarbar", browser));
  assert (browser.get(padUrl).currentUrl.indexOf("/ep/account/sign-in")  == -1);

  // check that the pad isn't showing up in browse
  assert (browser.get(_url(testPrivateDomain, "/ep/ajax-list"), {'section': 'shared'}).content.indexOf(localPadId)  == -1);

  // change pad to be everyone at private domain and verify it now is in browse
  model.accessPadGlobal(privateDomainId + "$" + localPadId, function(pad) {
    pad.setGuestPolicy("domain");
  });
  model.accessPadGlobal(privateDomainId + "$" + localPadId, function(pad) {
    dbwriter.writePadNow(pad, true);
  });

  var content = browser.get(_url(testPrivateDomain, "/ep/ajax-list"), {'section': 'shared'}).content;
  assert (content.indexOf(localPadId)  != -1);


  // simple tests to check request signing

  var cont = 'http://www.example.com/';
  // absoluteSignedURL returns encoded url params, though signing happens before encoding.
  // /clck should only redirect to cont when the signature is valid.
  var signedUrl = utils.absoluteSignedURL('/clck', {'id':'abc123', 'email':'!@(#*$-e92#@example.com', 'cont':cont}); 
  var unsignedUrl = utils.absoluteURL('/clck', {'id':'abc123', 'email':'!@(#*$-e92#@example.com', 'cont':cont, 'sig':'fakesignatur3'});
  var signedUrlDict = netutils.parseQueryString(signedUrl.split('?')[1]);
  var unencodedSignedUrlDict = {};
  eachProperty(signedUrlDict, function(k,v) {
    unencodedSignedUrlDict[decodeURIComponent(k)] = decodeURIComponent(v);
  }); // since the signature was over unencoded URI params
  assert (crypto.isValidSignedRequest(unencodedSignedUrlDict, signedUrlDict['sig']));
  assert (browser.get(signedUrl).currentUrl==cont);
  assert (browser.get(unsignedUrl).status==401);
}
