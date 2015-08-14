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

import("execution");
import("funhtml.*");
import("jsutils.*");
import("s3");
import("stringutils");
import("underscore._");

import("etherpad.changes.follow");
import("etherpad.log");
import("etherpad.sessions.{getSession,saveSession,isAnEtherpadAdmin}");
import("etherpad.utils");
import("etherpad.utils.*");
import("etherpad.helpers");
import("etherpad.importexport.importexport");
import("etherpad.pad.exporthtml");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");
import("etherpad.pad.model");
import("etherpad.pad.pad_security");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padlist");
import("etherpad.collab.collab_server");
import("etherpad.pad.pad_security");

jimport("java.io.File");
jimport("java.io.FileInputStream");
jimport("java.io.FileOutputStream");
jimport("java.io.BufferedOutputStream");
jimport("java.lang.System.out.println");
jimport("org.apache.commons.lang.StringEscapeUtils.unescapeHtml");

function onRequest(name) {
  if (name.match(/all_pads(\.\w+)?\.zip/)) {
    render_all_pads_zip_get();
    return true;
  } else if (name == "my_pads.zip") {
    render_my_pads_zip_get();
    return true;
  } else {
    return false;
  }
}

function _getBaseUrl() { return "/ep/padlist/"; }

function _renderPadNav() {
  var d = DIV({id: "padlist-nav"});
  var ul = UL();
  var items = [
    ['allpads', 'all-pads', "All Pads"],
    ['mypads', 'my-pads', "My Pads"],
    ['archivedpads', 'archived-pads', "Archived Pads"]
  ];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var cn = "";
    if (request.path.split("/").slice(-1)[0] == item[1]) {
      cn = "selected";
    }
    ul.push(LI(A({id: "nav-"+item[1], href: _getBaseUrl()+item[1], className: cn}, item[2])));
  }
  ul.push(html(helpers.clearFloats()));
  d.push(ul);
  d.push(html(helpers.clearFloats()));
  return d;
}

function _renderPage(name, data) {
  getSession().latestPadlistView = request.path + "?" + request.query;
  saveSession();
  var r = domains.getRequestDomainRecord();
  appjet.requestCache.proTopNavSelection = 'padlist';
  data.renderPadNav = _renderPadNav;
  data.orgName = r.orgName;
  data.renderNotice = function() {
    var m = getSession().padlistMessage;
    if (m) {
      delete getSession().padlistMessage;
      saveSession();
      return DIV({className: "padlist-notice"}, m);
    } else {
      return "";
    }
  };

  renderFramed("pro/padlist/"+name+".ejs", data);
}

function _renderListPage(padList, showingDesc, columns) {
  _renderPage("pro-padlist", {
    padList: padList,
    renderPadList: function() {
      return pro_padlist.renderPadList(padList, columns);
    },
    renderShowingDesc: function(count) {
      return DIV({id: "showing-desc"},
                  "Showing "+showingDesc+" ("+count+").");
    },
    isAdmin: pro_accounts.isAdminSignedIn()
  });
}


serverhandlers.tasks.doZipExport = function(pads, account, skipAccessChecks, optFormat,optDestinationEmail) {
  _render_pads_zip(pads, account, skipAccessChecks, optFormat, optDestinationEmail);
};

serverhandlers.tasks.doGlobalUsersZipExport = function(email_addresses, receiving_email, account, format) {
  var pads = pro_pad_db.listPadsCreatedByEmails(email_addresses);
  pro_pad_db.decorateWithCreators(pads);

  // Put pads in a subfolder with the owner.
  pads.forEach(function(pad) {
    pad.exportFileNamePrefix = pad.creator.email + "/created/";
  });

  // Find pads this user edited too (painful).
  email_addresses.forEach(function(email) {
    var edited_pads = pro_pad_db.listPadsEditedByEmail(email);
    edited_pads.forEach(function(pad) {
      pad.exportFileNamePrefix = email + "/edited/";
    });
    pads = pads.concat(edited_pads)
  });

  pads = _.compact(pads);

  _render_pads_zip(pads, account, true, format, receiving_email);
};

// Note: If you add a 'exportFileNamePrefix' to a pad, that's inserted before its filename in the ZIP.
//
// Params:
//    optDestinationEmail -- lets you supply a different destination e-mail if you don't want it to go to
//                           account.email
function _render_pads_zip(pads, account, skipAccessChecks, optFormat, optDestinationEmail) {
  var format = optFormat || "html";
  var destinationEmail = optDestinationEmail || account.email;

  var f = File.createTempFile("export-pads", (optFormat === null ? null : (optFormat == "" ? "" : "."+optFormat))+".zip");

  var fos = new FileOutputStream(f);
  var zos = new java.util.zip.ZipOutputStream(new java.io.BufferedOutputStream(fos));

  var titles = {};
  pads.forEach(function(padRow) {
    var padContent;
    var padTitle;

    var globalPadId = padutils.getGlobalPadId(padRow.localPadId, padRow.domainId);
    model.accessPadGlobal(globalPadId, function(pad) {
      padTitle = padutils.getProDisplayTitle(padRow.localPadId, padRow.title);
      padTitle = padTitle.replace(/[^\w\s]/g, "-");
      try {
        padContent = importexport.exportPadContent(pad, pad.getHeadRevisionNumber(), format);

        // flush the pad immediately if it was just loaded by us
        // TODO: if (!pad.lastAccessed()) { once we've restarted
        if (!pad._meta.status.lastAccess) {
          // no write will occur in this case
          dbwriter.writePadNow(pad, true/*and flush*/);
        }
        model.flushModelCacheForPad(globalPadId, pad.getHeadRevisionNumber());

      } catch(e) {
        log.logException("Error exporting pad to zip:" + padRow.localPadId);
        padContent = "";
      }
    }, "r", skipAccessChecks);

    // find unique title
    if (padRow.exportFileNamePrefix) {
      padTitle = padRow.exportFileNamePrefix + padTitle
    }

    var fileTitle = padTitle;
    var i = 0;
    while (fileTitle in titles) {
      i++;
      fileTitle = padTitle + String(i);
    }
    titles[fileTitle] = 1;

    fileTitle = fileTitle + importexport.formatFileExtension(format);

    zos.putNextEntry(new java.util.zip.ZipEntry(fileTitle));
    var padBytes = (new java.lang.String(padContent || "" )).getBytes("UTF-8")

    zos.write(padBytes, 0, padBytes.length);
    zos.closeEntry();
  });
  zos.close();

  var encryptedUserId = pro_accounts.getEncryptedUserId(account.id);
  var key = [domains.fqdnForDomainId(account.domainId), encryptedUserId, stringutils.randomString(10), "zip"].join(".");
  s3.put("hackpad-export", key, new java.io.FileInputStream(f), false /*isPublic*/, "application/zip");
  var downloadUrl = s3.getPresignedURL("hackpad-export", key, 3*24*60*60*1000/*valid for 3 days*/);

  utils.sendHtmlTemplateEmail(destinationEmail, "Your export is ready", "email/download_export.ejs", {downloadUrl:downloadUrl, name: account.fullName});

}

function render_my_pads_zip_get() {
  var myPads = pro_pad_db.listMyPads();

  format = request.params.format || "html";
  if (! (format in importexport.formats)) {
    render404();
  }

  execution.scheduleTask("importexport", "doZipExport", 0, [
    myPads, pro_accounts.getSessionProAccount(), false/*skipAccessChecks*/, format
  ]);

  return renderJSON({ success: true, html:helpers.modalDialog("Export in Progress", "We are preparing your download. \n \nYou will receive an email as soon as it is ready!", true)});
}

function render_all_pads_zip_get() {
  if ((! pro_accounts.isAdminSignedIn()) || domains.isPrimaryDomainRequest()) {
    response.redirect("/");
  }

  var pads = pro_pad_db.listAllDomainPads();

  format = request.params.format || "html";
  if (! (format in importexport.formats)) {
    render404();
  }

  execution.scheduleTask("importexport", "doZipExport", 0, [
    pads, pro_accounts.getSessionProAccount(), true/*skipAccessControl*/, format
  ]);

  return renderJSON({ success: true, html:helpers.modalDialog("Export in Progress", "We are preparing your download. \n \nYou will receive an email as soon as it is ready!", true)});
}

// Does not render, just creates the job.
function sendPadsToZip(emailAddresses, receivingEmail, format) {
  if (!isAnEtherpadAdmin()) {
    response.redirect("/");
  }

  format = format || "html";
  if (!(format in importexport.formats)) {
    render404();
  }

  execution.scheduleTask("importexport", "doGlobalUsersZipExport", 0, [
    emailAddresses, receivingEmail, pro_accounts.getSessionProAccount(), format
  ]);
}

function render_my_pads_get() {
  _renderListPage(
      pro_pad_db.listMyPads(),
      "pads created by me",
      ['secure', 'title', 'lastEditedDate', 'editors', 'actions']);
}

/*function render_archived_pads_get() {
  helpers.addClientVars({
    showingArchivedPads: true
  });
  _renderListPage(
      pro_pad_db.listArchivedPads(),
      "archived pads",
      ['secure', 'title', 'lastEditedDate', 'actions']);
}*/

/*function render_edited_by_get() {
  var editorId = request.params.editorId;
  var editorName = pro_accounts.getFullNameById(editorId);
  _renderListPage(
    pro_pad_db.listPadsEditedBy(editorId),
    "pads edited by " + unescapeHtml(editorName),
    ['secure', 'title', 'lastEditedDate', 'editors', 'actions']);
}*/

function render_delete_post() {
  var localPadId = request.params.padIdToDelete;

  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    if (!pad_security.checkIsPadAdmin(propad)) {
      return render401("Unauthorized");
    }
    propad.markDeleted();
    getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been deleted.';
    saveSession();
    collab_server.broadcastServerMessage({
      type: 'HANDLE_DELETE',
    }, propad.getGlobalId());
  });


  var globalPadId = padutils.getGlobalPadId(localPadId);

  // apns: send delete to creator, followers and group members
  var userIdsToNotify = [pro_accounts.getSessionProAccount().id]
    .concat(follow.allUserIdsFollowingPad(globalPadId))
    .concat(follow.allUserIdsFollowingPadViaCollection(globalPadId));
  for (i in userIdsToNotify) {
    pro_apns.sendPushNotificationForPad(globalPadId, null, userIdsToNotify[i], pro_apns.APNS_HP_T_DELETE);
  }

  if (request.params.returnPath) {
    var cont = pad_security.sanitizeContUrl(request.params.returnPath);
    response.redirect(cont);
  } else {
    renderJSON({success:true});
  }
}

function render_undelete_post() {
  var localPadId = request.params.padIdToDelete;

  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    if (!pad_security.checkIsPadAdmin(propad)) {
      return render401("Unauthorized");
    }
    propad.unmarkDeleted();
    getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been restored.';
    saveSession();
  });

  if (request.params.returnPath) {
    var cont = pad_security.sanitizeContUrl(request.params.returnPath);
    response.redirect(cont);
  } else {
    renderJSON({success:true});
  }
}

function render_toggle_archive_post() {
  var localPadId = request.params.padIdToToggleArchive;

  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    if (propad.isArchived()) {
      propad.unmarkArchived();
      getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been un-archived.';
    } else {
      propad.markArchived();
      getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been archived.  You can view archived pads by clicking on the "Archived" tab at the top of the pad list.';
    }
    saveSession();
  });

  var cont = pad_security.sanitizeContUrl(request.params.returnPath);
  response.redirect(cont);
}


