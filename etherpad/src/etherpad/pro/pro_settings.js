
import("etherpad.changes.follow");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_key_values");
import("etherpad.utils.*");

function setAccountGetsFollowEmails(accountId, wantsEmail) {
  var count = 0;
  var followFlag = wantsEmail ? follow.FOLLOW.EVERY : follow.FOLLOW.NO_EMAIL;
  follow.allPadIdsUserFollows(accountId).forEach(function(padId) {
    if (padId == "1$undefined") {
      return;
    }

    follow.updateUserFollowPrefForPad(padId, accountId, followFlag);
    count++;
  });

  if (wantsEmail) {
    pro_accounts.setAccountWantsFollowEmail(accountId);
  } else {
    pro_accounts.setAccountDoesNotWantFollowEmail(accountId);
  }
  return count;
}

function getAccountGetsFollowEmails(account) {
  return ! pro_accounts.getAccountDoesNotWantFollowEmail(account);
}

function setAccountDoesNotWantNewPadsDigest(accountId, value) {
  pro_key_values.updateValueForAccounts([accountId], 'doesNotWantSitesDigest', value);
}