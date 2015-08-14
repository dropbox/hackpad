import("etherpad.globals.*");

import("etherpad.changes.follow");
import("etherpad.pad.exporthtml");
import("etherpad.pad.padusers");
import("etherpad.pad.padutils");
import("etherpad.pad.padevents");
import("etherpad.pad.pad_security");
import("etherpad.pad.model");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_invite");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_utils");
import("etherpad.statistics.email_tracking");
import("etherpad.log");
import("etherpad.utils.*");
import("etherpad.collab.collab_server");
import("etherpad.collab.ace.easysync2.Changeset");

import("email.sendEmail");

function domainWelcomePadSourceId() {
  appjet.config.welcomePadSourceId;
}

function welcomePadSourceId() {
  appjet.config.welcomePadSourceId;
}

function featureHelpPadId() {
  return appjet.config.featureHelpPadId;
}

function onFirstSignIn () {
  if (domains.isPrimaryDomainRequest()) {

    var padId = createWelcomePadForNewUser();

    // Follow Hackpad Feature Help (no email)
    follow.maybeStartFollowingPad(domains.getRequestDomainId(), featureHelpPadId(),
      getSessionProAccount().id, true);

    response.setCookie({
      name: "showNewPadTip",
      value: "T",
      path: "/",
      expires: new Date(32503708800000), // year 3000
    });
  } else if (!pro_accounts.getIsDomainGuest(getSessionProAccount()) &&
             pro_config.getConfig().welcomePadURL) {

    var padUrl = pro_config.getConfig().welcomePadURL.split("#")[0];
    if (padUrl) {
      // NOTE: we accept absolute or relative URLs
      var parts = padUrl.split("/");
      var localPadId = parts[parts.length-1]; // last part
      if (localPadId) {
        // strip the optional encoded title
        localPadId = localPadId.split("-").pop();

        // give the new user access to this pad
        var creatorId;
        var proceed = pro_padmeta.accessProPad(padutils.getGlobalPadId(localPadId), function(propad) {
            if (!propad.exists() || propad.isDeleted()) {
              return false;
            }

            creatorId = propad.getCreatorId();
            return true;
        });
        if (proceed) {
          pad_security.grantUserIdAccessToPad(padutils.getGlobalPadId(localPadId),
            creatorId, getSessionProAccount());
          notifyNewUserOfWelcomePad(getSessionProAccount().email, localPadId);
        }
      }
    }
  } else if (pro_pad_db.countOfDomainPads() == 0) {
    var padId = createAutoPadForUser(getSessionProAccount(),
        padutils.getGlobalPadId(domainWelcomePadSourceId(), 1), true);
    pro_config.setConfigVal("welcomePadURL", "/"+padId);
    notifyNewUserOfWelcomePad(getSessionProAccount().email, padId);
  }
}

function createWelcomePadForNewUser() {
  return createAutoPadForUser(getSessionProAccount(), padutils.getGlobalPadId(welcomePadSourceId()));
}

function createAutoPadForUser(account, globalSourcePadId, giveOwnership) {
  var title = null;
  var atext = null;
  var apool = null;
  var creatorId = null;
  var authorDatas = {};

  // Extract the information we need from the template welcome pad
  model.accessPadGlobal(globalSourcePadId, function(pad) {
    // No welcome pad template exists, create one
    if (!pad.exists()) {
      if (isProduction()) {
        log.logException("The template pad ["+globalSourcePadId+"] does not exist!");
      }
      title = "Welcome to Hackpad!";
      pad.create(title, title);
    }

    atext = pad.atext();
    apool = pad.pool();
    pad.eachATextAuthor(atext, function (author, authorNum) {
      authorDatas[author] = pad.getAuthorData(author);
    });
  }, 'r', true);
  pro_padmeta.accessProPad(globalSourcePadId, function(propad) {
      title = propad.getDisplayTitle();
      creatorId = propad.getCreatorId();
  });

  // Create a new pad, owned by HackPad Team and paste the template into it
  var newPadId = randomUniquePadId();
  var success = padutils.accessPadLocal(newPadId, function(pad) {
    if (!pad.exists()) {
      pad.create(title, title);
      padevents.onNewAutoPad(pad);

      pro_padmeta.accessProPad(padutils.getGlobalPadId(newPadId), function(ppad) {
        if (giveOwnership) {
          ppad.setCreatorId(account.id);
          ppad.setLastEditor(account.id);
        } else {
          ppad.setCreatorId(creatorId);
          ppad.setLastEditor(creatorId);
        }
        ppad.setLastEditedDate(new Date());
      });

      collab_server.setPadAText(pad, atext, apool,
        giveOwnership ? undefined : padusers.getUserIdForProUser(creatorId));
      for (author in authorDatas) {
        pad.setAuthorData(author, authorDatas[author]);
      }

      if (giveOwnership) {
        // strip authorship from atext and apool
        var builder = Changeset.builder(atext.text.length);
        builder.keep(atext.text.length, atext.text.split('\n').length-1, [['author', '']], pad.pool());
        var cs = builder.toString();
        pad.appendRevision(cs);
      }

      pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
      return true;
    }
    return false;
  });

  if (success) {
    if (!giveOwnership) {
      // give the new user access to this pad
      pad_security.grantUserIdAccessToPad(padutils.getGlobalPadId(newPadId),
          creatorId, account, account.fbid);
    }

    return newPadId;
  } else {
    return null;
  }
}

function notifyNewUserOfWelcomePad(emailAddress, padId) {
  var invitedBy = "The Hackpad Team";
  var invitedTo = "Hackpad";

  if (!domains.isPrimaryDomainRequest()) {
    var admins = pro_accounts.listAllDomainAdmins(domains.getRequestDomainId());
    if (admins.length && admins[0].email != emailAddress) {
      invitedBy = admins[0].fullName;
    }
    invitedTo = domains.getRequestDomainRecord().subDomain + "." + appjet.config['etherpad.canonicalDomain'];
  }

  var trackingId = email_tracking.trackEmailSent(emailAddress, email_tracking.DOMAIN_WELCOME);
  var editlink = absolutePadURL(padId, {eid: trackingId});
  pro_invite.sendPadInviteEmail(emailAddress, pro_utils.getFullProDomain(), request.host, request.scheme, invitedBy, padId, "Welcome to " + invitedTo + "!", undefined/*revId*/, editlink);
}

function notifyUserOfUpdatePad(emailAddress, padId, htmlContent) {
  pro_invite.sendPadInviteEmail(emailAddress, pro_utils.getFullProDomain(), request.host, request.scheme, "The Hackpad Team", padId,  "Hello from Hackpad!",
      undefined /*revId*/, undefined /*editLink*/, htmlContent, "text/html; charset=utf-8");
}
