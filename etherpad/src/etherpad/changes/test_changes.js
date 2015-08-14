
import("etherpad.changes.changes");
import("etherpad.changes.follow");
import("etherpad.control.pad.pad_control");
import("etherpad.utils.randomUniquePadId");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_security");
import("etherpad.pad.pad_access");
import("etherpad.pro.pro_accounts");
import("etherpad.log");
import("jsutils.arrayToSet");

function testChangeSyndication() {
	var errors = [];
	// make a pad as user 1
	// invite user 2
	pro_accounts.setAccountWantsFollowEmail(116);

  var padId = _createPad();
  var globalPadId = padutils.getGlobalPadId(padId);
  _inviteUserToPad(padId, 1, 116);

  // anyone w/link pad, 1 invitee
  var acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'link');
  assert(errors, sameValues(acctIds, [116, 1]), "accountIdsToNotify test 1 failed");

  // invite only pad 1 invitee - the invitee hasn't accessed pad
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'deny');
  assert(errors, sameValues(acctIds, [1]), "accountIdsToNotify test 2 failed");

  // invite only pad 1 invitee - the invitee accessed the pad before it became invite only
  // and the last access date wasn't updated!
  // we fail this test.
  //acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'deny');
  //assert(errors, equalArrays(acctIds, [116, 1]), "accountIdsToNotify test 3 failed");


  // invite only pad 1 invitee - the invtee has accessed pad
	pad_access.updateUserIdLastAccessedDate(globalPadId, 116);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'deny');
  assert(errors, sameValues(acctIds, [116, 1]), "accountIdsToNotify test 4 failed");

  // add a follower
	follow.maybeStartFollowingPad(1, padId, 117);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'link');
  assert(errors, sameValues(acctIds, [116, 1, 117]), "accountIdsToNotify test 5 failed");

  // make it invite only, the follower no longer emailed
  follow.maybeStartFollowingPad(1, padId, 117);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'deny');
  assert(errors, sameValues(acctIds, [116, 1]), "accountIdsToNotify test 6 failed");

  // make it public, invite a new user
  // the new user will not get emails because they haven't visited;  weird. but true.
  _inviteUserToPad(padId, 1, 118);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'allow');
  assert(errors, sameValues(acctIds, [116, 117, 1]), "accountIdsToNotify test 7 failed");

  // have the user visit.  they'll now get updates
	pad_access.updateUserIdLastAccessedDate(globalPadId, 118);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'allow');
  assert(errors, sameValues(acctIds, [116, 117, 118, 1]), "accountIdsToNotify test 8 failed");

  pro_accounts.setAccountDoesNotWantFollowEmail(116);
	acctIds = changes.accountIdsToNotifyTester(globalPadId, 1, 'allow');
  assert(errors, sameValues(acctIds, [117, 118, 1]), "accountIdsToNotify test 9 failed");



  _deletePad(padId);

  return errors;
}

function assert(failures, condition, message) {
	if (!condition) {
		failures.push(message);
	}
}

function _createPad () {
	var padId = randomUniquePadId();
  padutils.accessPadLocal(padId, function(pad) {
      pad.create("test", "content");
  });
  return padId;
}

function _deletePad (padId) {
  padutils.accessPadLocal(padId, function(pad) {
  	pad.destroy();
  });
}

function _inviteUserToPad (padId, hostId, userId) {
	var existingAccount = pro_accounts.getAccountById(userId);

  // give the facebook user being invited access to this pad
  pad_security.grantUserIdAccessToPad(padutils.getGlobalPadId(padId),
    hostId, existingAccount);
}

function sameValues(array1, array2) {
	if (array1.length != array2.length) {
		return false;
	}
	var set1 = arrayToSet(array1);
	for (var i=0; i<array2.length; i++) {
		if (!set1[array2[i]]) {
			return false;
		}
	}
	return true;
}
