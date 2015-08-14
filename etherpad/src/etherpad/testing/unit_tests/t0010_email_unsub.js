
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.testing.mock_browser.MockBrowser");
import("etherpad.testing.testutils.*");
import("etherpad.utils");
import("stringutils");

function run() {

  var testPrivateDomain = "unittestprivate" + stringutils.randomString(10).toLowerCase();
  var testEmailAddy = "noreply+" + stringutils.randomString(10).toLowerCase() + "@hackpad.com";

  var testPrivateDomainId = domains.createNewSubdomain(testPrivateDomain, testPrivateDomain);

  // create an invite on the private site and try again
  var email = testEmailAddy;
  var acctId = pro_accounts.createNewAccount(testPrivateDomainId, email, email, null, false, true, null /* fbid */, true/*guest*/);

  var unsubURL = utils.absoluteSignedURL("/ep/account/settings/unsub-new-pads", {accountId: pro_accounts.getEncryptedUserId(acctId)}, testPrivateDomain);
  var browser = new MockBrowser();
  result = browser.get(unsubURL);
  assert(result.status == 200);
  assert(result.currentUrl == unsubURL);
}



