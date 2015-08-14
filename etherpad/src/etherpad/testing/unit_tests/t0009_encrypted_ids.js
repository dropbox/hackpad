import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_accounts");
import("etherpad.testing.testutils.*");
import("crypto.{encryptedId,decryptedId}");
import("etherpad.statistics.email_tracking");



function run() {
  // test new encrypt/decrypt
  failedIds = [];
  for (var i=0; i<10000; i++) {
    try {
      if (i != decryptedId(encryptedId(i))) {
        failedIds.push(i);
      }
    } catch(e) {
     failedIds.push(i);
    }
  }

  assertTruthy(failedIds.length == 0);

  // test email tracking
  var encryptedEmailId = email_tracking.trackEmailSent("foo@example.com", email_tracking.NEW_PADS_DIGEST, 0);
  assertTruthy(email_tracking.trackEmailClick(encryptedEmailId));

}