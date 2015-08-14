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

import("funhtml.*");
import("comet");
import("varz");
import("cache_utils.syncedWithCache");
import("email.sendEmail");
import("fastJSON");
import("jsutils.{eachProperty,keys}");
import("sqlbase.sqlbase");
import("stringutils.{toHTML,trim}");
import("stringutils");
import("netutils");

import("etherpad.changes.changes");
import("etherpad.changes.follow");
import("etherpad.collab.ace.easysync2.{AttribPool,Changeset}");
import("etherpad.collab.collab_server");
import("etherpad.globals.isProduction");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.log");
import("etherpad.sessions");
import("etherpad.sessions.getSession");
import("etherpad.statistics.email_tracking");
import("etherpad.utils.*");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_facebook");
import("etherpad.pro.pro_groups");
import("etherpad.pro.pro_invite");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.domains");
import("etherpad.pro.domain_migration");
import("etherpad.pro.pro_config");
import("etherpad.pro.pro_xmpp");

import("etherpad.pad.revisions");
import("etherpad.pad.chatarchive");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pad.pad_security");
import("etherpad.pad.padevents");

import("etherpad.control.relatedcontrol");
import("etherpad.control.pad.pad_diff_control");
import("etherpad.control.pad.pad_summary_control");
import("etherpad.control.pad.pad_view_control");
import("etherpad.control.pad.pad_changeset_control");
import("etherpad.control.pad.pad_importexport_control");
import("etherpad.control.pad.pad_render_control");
import("etherpad.control.pad.pad_follow_control");
import("etherpad.collab.readonly_server");

import("etherpad.control.pad.pad_view_control.getRevisionInfo");

import("etherpad.pad.exporthtml");

import("dispatch.{Dispatcher,PrefixMatcher,forward}");


function onStartup() {
  sqlbase.createJSONTable("PAD_DIAGNOSTIC");
}

function onRequest() {
  var noAcctDisp = new Dispatcher();
  noAcctDisp.addLocations([
    [/^\/[^\/]+-([a-zA-Z0-9]{11})\.js$/, render_pad_embed_script_get], // pretty pad url
    [/^\/[^\/]+-([a-zA-Z0-9]{11})\/fork$/, render_fork_both], // pretty pad url
    [/^\/[^\/]+-([a-zA-Z0-9]{11})$/, pad_render_control.render_pad_get], // pretty pad url
    [/^\/([^\/]+)\.js$/, render_pad_embed_script_get],
    [/^\/([^\/]+)$/, pad_render_control.render_pad_get],

    ['/ep/pad/apply-missed-changes', render_apply_missed_changes_post],
    ['/ep/pad/feedback', render_feedback_post],
    [/^\/ep\/oembed\/([a-zA-Z0-9]{11})$/, render_oembed_get],
    [PrefixMatcher('/ep/pad/fork/'), render_fork_both],
    [PrefixMatcher('/ep/pad/static/'), render_static_get],

    [PrefixMatcher('/ep/pad/follow'), forward(pad_follow_control)],
    [PrefixMatcher('/ep/pad/'), forward(pad_render_control)],
    [PrefixMatcher('/ep/pad/'), forward(relatedcontrol)],
  ]);
  if (noAcctDisp.dispatch()) {
    return true;
  }

  if (pro_utils.isProDomainRequest()) {
    pro_utils.preDispatchAccountCheck();
  }

  var disp = new Dispatcher();
  disp.addLocations([
    [/^\/ep\/pad\/([^\/]+)\/revert\-to\/(\d+)$/, render_revert_to_post],
    [PrefixMatcher('/ep/pad/summary/'), forward(pad_summary_control)],
    [PrefixMatcher('/ep/pad/diff/'), forward(pad_diff_control)],
    [PrefixMatcher('/ep/pad/view/'), forward(pad_view_control)],
    [PrefixMatcher('/ep/pad/changes/'), forward(pad_changeset_control)],
    [PrefixMatcher('/ep/pad/impexp/'), forward(pad_importexport_control)],
    [PrefixMatcher('/ep/pad/export/'), pad_importexport_control.renderExport],
  ]);
  return disp.dispatch();
}

//----------------------------------------------------------------
// utils
//----------------------------------------------------------------

function getDefaultPadText(title) {
  return renderTemplateAsString("misc/pad_default.ejs", {padTitle:title, padUrl: request.url.split("?", 1)[0]});
}

function assignColorId(pad, userId, optColorsToAvoid) {
  // use pad-specific color if possible
  var userData = pad.getAuthorData(userId);
  if (userData && ('colorId' in userData)) {
    return userData.colorId;
  }

  // assign random unique color
  function r(n) {
    return Math.floor(Math.random() * n);
  }
  var colorsUsed = {};
  var users = collab_server.getConnectedUsers(pad);
  var availableColors = [];
  users.forEach(function(u) {
    colorsUsed[u.colorId % getPalette().length] = true;
  });
  if (optColorsToAvoid) {
    optColorsToAvoid.forEach(function(colorId) {
      colorsUsed[colorId % getPalette().length] = true;
    });
  }
  for (var i = 0; i < getPalette().length; i++) {
    if (!colorsUsed[i]) {
      availableColors.push(i);
    }
  }
  if (availableColors.length > 0) {
    return availableColors[0];
  } else {
    return r(getPalette().length);
  }
}

//----------------------------------------------------------------
// linkfile (a file that users can save that redirects them to
// a particular pad; auto-download)
//----------------------------------------------------------------
function render_linkfile_get() {
  var padId = request.params.padId;

  renderHtml("pad/pad_download_link.ejs", {
    padId: padId
  });

  response.setHeader("Content-Disposition", "attachment; filename=\""+padId+".html\"");
}


//----------------------------------------------------------------
// newpad
//----------------------------------------------------------------

function render_newpad_both() {
  var session = getSession();
  var padId;

  ensureIsAllowedToCreate();

  padId = randomUniquePadId();

  session.instantCreate = padId;
  session.instantCollectionId = request.params.collection;
  session.instantTitle = "Untitled";

  if (request.params.title) {
    getSession().instantTitle = request.params.title;
  } else {
    if (!request.cookies['teach']){
      response.setCookie({
        name: "teach",
        value: request.cookies['showInviteSomeoneTip'] ? "1" : "0",
        path: "/",
        expires: new Date(32503708800000), // year 3000
      });
    }
  }

  sessions.saveSession();

  response.redirect("/"+padId);
}


function ensureIsAllowedToCreate() {
  if (!getSessionProAccount()) {
    response.redirect('/ep/account/sign-in?cont='+encodeURIComponent(request.url));
  }

  if (pro_accounts.getIsDomainGuest(getSessionProAccount()) && !domains.isPublicDomain()) {
    renderNoticeString("<div style='margin-top:30px; text-align:center;'>Guests cannot create pads in this Hackpad space </div> <div style='font-size:20px; margin-top:40px; margin-bottom:80px; text-align:center;'> But you can <a href='/ep/invite/request-to-join?uid="+ getSessionProAccount().id +"'> ask to become a full member</a>.</div>");
    response.stop();
  }
}


function setMissingAuthorDatas(pad, list) {
  var userInfos = {};
  var newColorIds = [];
  for (var i=0; i<list.length; i++){
    var authorId = list[i];
    var userId = padusers.getAccountIdForProAuthor(authorId);
    // see if we already have this author in this pad
    var authorData = pad.getAuthorData(authorId);
    if (!authorData) {
      var account = pro_accounts.getAccountById(userId);
      var newColorId = assignColorId(pad, userId, newColorIds/*colorsToAvoid*/);
      newColorIds.push(newColorId);
      if (account) {
        var name = account.fullName;
        authorData = {
          colorId: newColorId,
          name: account.fullName,
          userLink: pro_accounts.getUserLinkById(userId)
        };
        pad.setAuthorData(authorId, authorData);
      } else {
        authorData = {
          colorId: newColorId,
          name: "Guest",
        };
        pad.setAuthorData(authorId, authorData);
      }
    }

    if (!userInfos[authorId] && authorData) {
      userInfos[authorId] = authorData;
    }
  }

  return userInfos;
}


function render_add_authors_post() {
  var localPadId = request.params.padId;
  var list = request.params.list.split("|");
  var userInfos = padutils.accessPadLocal(localPadId, function(pad) {
    return setMissingAuthorDatas(pad, list);
  });

  // return the info as well, so it's faster
  response.setContentType('text/x-json');
  response.write(fastJSON.stringify(userInfos));
  return true;
}

function render_revert_to_post(padId, revisionId) {
  padutils.accessPadLocal(padId, function(pad) {
    var isCreator = false;
    pro_padmeta.accessProPadLocal(padId, function(propad) {
      isCreator = getSessionProAccount() && (getSessionProAccount().id == propad.getCreatorId());
    });
    if (!(isCreator || getSessionProAccount().isAdmin)) {
      return false;
    }
    if (revisionId > pad.getHeadRevisionNumber()) {
      renderJSONError(403, "Invalid revision");
    }
    var atext = pad.getInternalRevisionAText(revisionId);
    collab_server.setPadAText(pad, atext);
    var newText = pad.text();
    newTitle = trim(newText.substring(0, newText.indexOf('\n')));
    newTitle = newTitle.replace(/^\*/, '');
    newTitle = newTitle.substring(0, pro_padmeta.MAX_TITLE_LENGTH);
    padevents.onEditPad(pad, getSessionProAccount().id, newTitle);
    pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
  });
  response.redirect('/'+padId);
  return true;
}

function render_embedded_pad_invite_get() {
  // returns whether a pad with a given embed-id exists,
  // and if so, how many people are connected to it
  var sessionToken = request.params.sessionToken;
  var existingPadId = padutils.makeValidLocalPadId(sessionToken);

  var connections = 0;
  var exists = false;
  padutils.accessPadLocal(existingPadId, function(pad) {
    if (pad.exists()) {
      exists = true;
      connections = collab_server.getNumConnections(pad);
    }
  }, 'r');

  response.setContentType('text/x-json');
  response.write(fastJSON.stringify(revisions.getRevisionList(pad)));

  response.setContentType('text/plain; charset=utf-8');
  if (exists) {
    response.write(connections + " people are connected to this pad");
  } else {
    response.write("This session doesn't exist");
  }
}

//----------------------------------------------------------------
// pad
//----------------------------------------------------------------

function isUserFollowingPad(globalPadId, creatorId, usersForUserList) {

  var following = false;

  if (getSessionProAccount()) {
    var userId = padusers.getUserIdForProUser(getSessionProAccount().id);
    var followPref = follow.getUserFollowPrefForPad(globalPadId,
        getSessionProAccount().id);
    if (followPref == follow.FOLLOW.DEFAULT) {
      following = getSessionProAccount().id == creatorId ||
        usersForUserList.filter(function(u) { return u.userId == userId; }).length > 0;
    } else if (followPref != follow.FOLLOW.IGNORE) {
      following = true;
    }
  }

  return following;
}

function render_pad_follow_button_post() {
  var localPadId = request.params.padId;
  var creatorId = false;
  var userList = [];
  padutils.accessPadLocal(localPadId, function (pad) {
    pro_padmeta.accessProPad(padutils.getGlobalPadId(localPadId), function(propad) {
      creatorId = propad.getCreatorId();
    });
    userList = getUsersForUserList(pad, creatorId);
  });

  return renderPartial('pad/_follow.ejs', 'followButton', {
    padId: localPadId,
    following: isUserFollowingPad(padutils.getGlobalPadId(localPadId), creatorId, userList),
    opt_noLabel: true
  });
}

function getUserIdsWithStatusForPad(pad, creatorId, optLimit) {
  var userIdToStatus = {};
  var globalPadId = pad.getId();
  var limit = optLimit || 50;

  pad_security.getAllUserIdsWithAccessToPad(globalPadId).forEach(function(userId) {
    userIdToStatus[userId] = "invited";
  });

  if (pad.getGuestPolicy() != "deny") {
    var allFollowers = follow.allUserIdsFollowingPad(globalPadId);
    allFollowers = allFollowers.concat(follow.allUserIdsFollowingPadViaCollection(globalPadId));

    for (var i=0; i<allFollowers.length && i<limit; i++) {
      var userId = allFollowers[i];
      userIdToStatus[userId] = "following";
    }
  }

  if (creatorId) {
    userIdToStatus[creatorId] = "creator";
  }

  return userIdToStatus;
}

function getUsersForUserList(pad, creatorId) {

  var userIdToStatus = getUserIdsWithStatusForPad(pad, creatorId);

  // load accounts
  var users = pro_accounts.getAccountsByIds(keys(userIdToStatus));

  var userInfos = [];
  for (var i=0; i<users.length; i++) {
    if (!users[i] || users[i].isDeleted) { continue; }
    var userInfo = {name: users[i].fullName.replace(/%20/g, " "),
      userId: padusers.getUserIdForProUser(users[i].id),
      userLink: pro_accounts.getUserLinkById(users[i].id),
      userPic: pro_accounts.getPicById(users[i].id),
      status: userIdToStatus[users[i].id],
      colorId: 1,
    };
    userInfos.push(userInfo);
  }

  return userInfos;
}

function render_pad_embed_script_get(localPadId) {
  response.allowFraming();

  var data = {
    protocol: appjet.config.useHttpsUrls ? "https://" : "http://",
    host: request.host,
    padId: toHTML(localPadId),
    width: toHTML(request.params.width || 800),
    height: toHTML(request.params.height || 800),
  };

  if (request.params.format == "html") {
    padutils.accessPadLocal(localPadId, function(pad) {
      data.padHtml = exporthtml.getPadHTML(pad, pad.getHeadRevisionNumber(), false/*removeTitleLine*/, false/*unescapeCodeFragment*/, true/*absoluteURLs*/);
    });
  } else if (request.params.format == "html-notitle") {
    padutils.accessPadLocal(localPadId, function(pad) {
      data.padHtml = exporthtml.getPadHTML(pad, pad.getHeadRevisionNumber(), true/*removeTitleLine*/, false/*unescapeCodeFragment*/, true/*absoluteURLs*/);
    });
  } else {
    data.padHtml = '';
  }

  response.setContentType('application/javascript; charset=utf-8');
  response.write(renderTemplateAsString('pad/embed_script.ejs', data));
  return true;
}


function render_oembed_get(localPadId) {
  response.allowFraming();

  var title;
  padutils.accessPadLocal(localPadId, function(pad) {
    var text = trim(model.cleanText(pad.text() || ''));
    title = text.split('\n')[0];
  }, 'r');

  var data = {
    protocol: appjet.config.useHttpsUrls ? "https://" : "http://",
    host: request.host,
    padId: toHTML(localPadId),
    width: toHTML(request.params.width || 800),
    height: toHTML(request.params.height || 800),
    title: title,
  };

  response.setContentType('application/xml; charset=utf-8');
  response.write(renderTemplateAsString('pad/oembed.ejs', data));
  return true;
}

function render_static_get(localPadId) {
  response.allowFraming();

  padutils.accessPadLocal(localPadId, function(pad) {
    if (!pad.exists()) {
      render404();
    }

    // Check for deleted pads
    pro_padmeta.accessProPadLocal(localPadId, function(propad) {
      if (propad.exists() && propad.isDeleted()) {
        render404();
       }
    });

    response.write(exporthtml.getPadHTMLDocument(pad, pad.getHeadRevisionNumber()));
  });
  return true;
}

function _render_create_post () {
  var padId = request.params.padId;
  if (!padId) {
    padId = randomUniquePadId();
  }

  getSession().instantCreate = padId;
  getSession().instantTitle = request.params.title;
  getSession().instantContent = request.params.content;

  sessions.saveSession();

  return padId;
}

function render_create_post() {
  var padId = _render_create_post();
  response.redirect("/"+padId);
}

function _atext_with_added_newline (text, attribs) {
  text = text+'\n';

  var assem = Changeset.smartOpAssembler();
  var newline = Changeset.newOp('+');
  newline.chars = 1;
  newline.lines = 1;
  var iter = Changeset.opIterator(attribs);
  while (iter.hasNext()) {
    assem.append(iter.next());
  }

  assem.append(newline);
  attribs = assem.toString();

  return Changeset.makeAText(text, attribs);
}

function render_ajax_create_post() {
  var padId = randomUniquePadId();
  var sourcePadId = request.params.sourcePadId;
  var encryptedGroupId = request.params.groupId;
  var title = request.params.title || "Untitled";
  title = title.substring(0, 80);
  var text = request.params.text || "";
  var attribs = request.params.attribs;


  var apool = null;
  var titleOnly = !(text&&attribs) || (text == title);
  if (!titleOnly) {
    apool = (new AttribPool()).fromJsonable(fastJSON.parse(request.params.apool));
  }

  padutils.accessPadLocal(padId, function(pad) {
    if (titleOnly) {
      pad.create(title + "\n\n", title);
    } else {
      pad.create(null, title);

      var atext = _atext_with_added_newline(text, attribs);
      collab_server.setPadAText(pad, atext, apool);

      var author = padusers.getUserIdForProUser(getSessionProAccount().id);
      collab_server.prependPadText(pad, title + "\n", author);
    }

    // add pad to group if requested
    if (encryptedGroupId) {
      var groupId = pro_groups.getGroupIdByEncryptedId(encryptedGroupId);

      if (!pro_groups.userMayEditGroup(getSessionProAccount(), groupId)) {
        log.logException("Unauthorized add pad to group");
        return false;
      }

      pro_groups.addPadToCollection(groupId, padId, getSessionProAccount().id);
    }


    // copy the guestPolicy, author infos, and access controls
    if (sourcePadId) {
      var guestPolicy = null;
      padutils.accessPadLocal(sourcePadId, function(sourcePad) {
        guestPolicy = sourcePad.getGuestPolicy();
        pad.setGuestPolicy(sourcePad.getGuestPolicy());

        if (!titleOnly) {
          pad.eachATextAuthor(pad.atext(), function (author, authorNum) {
            pad.setAuthorData(author, sourcePad.getAuthorData(author));
          });
        }
      });

      if (guestPolicy == "deny") {
        // copy pad access from the source pad;  for now, don't send emails;
        pad_security.copyAccessFromPadToPad(
          padutils.getGlobalPadId(sourcePadId), padutils.getGlobalPadId(padId),
          getSessionProAccount().id);
      }

      // make sure that the creator of the original pad can access the new pad
      // note: behavior for "friends" policy is pretty wierd here
      if (guestPolicy == "deny") {
        pro_padmeta.accessProPad(padutils.getGlobalPadId(sourcePadId), function(propad) {
          if (getSessionProAccount().id != propad.getCreatorId()) {
            var targetUser = pro_accounts.getAccountById(propad.getCreatorId());
            pad_security.grantUserIdAccessToPad(pad.getId(), getSessionProAccount().id,
                targetUser);
          }
        });
      }

      // copy collection membership
      var groupIds = pro_groups.getPadGroupIds(padutils.getGlobalPadId(sourcePadId));
      groupIds.forEach(function(groupId) {
        if (pro_groups.isModerated(groupId) &&
          !pro_groups.isOwner(groupId, getSessionProAccount().id)) {
          // don't add
        } else {
          pro_groups.addPadToCollection(groupId, padId, getSessionProAccount().id);
        }
      });

    }
  });

  response.setContentType('text/plain; charset=utf-8');
  response.write(padId);
}

//----------------------------------------------------------------
// saverevision
//----------------------------------------------------------------

function render_saverevision_post() {
  var padId = request.params.padId;
  var savedBy = request.params.savedBy;
  var savedById = request.params.savedById;
  var revNum = request.params.revNum;
  padutils.accessPadLocal(padId, function(pad) {
    if (! pad.exists()) { response.notFound(); }
    var savedRev = revisions.saveNewRevision(pad, savedBy, savedById,
                                             revNum);
    readonly_server.broadcastNewRevision(pad, savedRev);
    response.setContentType('text/x-json');
    response.write(fastJSON.stringify(revisions.getRevisionList(pad)));
  });
}

function render_saverevisionlabel_post() {
  var userId = request.params.userId;
  var padId = request.params.padId;
  var revId = request.params.revId;
  var newLabel = request.params.newLabel;
  padutils.accessPadLocal(padId, function(pad) {
    revisions.setLabel(pad, revId, userId, newLabel);
    response.setContentType('text/x-json');
    response.write(fastJSON.stringify(revisions.getRevisionList(pad)));
  });
}

function render_getrevisionatext_get() {
  var padId = request.params.padId;
  var revId = request.params.revId;
  var result = null;

  var rev = padutils.accessPadLocal(padId, function(pad) {
    var r = revisions.getStoredRevision(pad, revId);
    var forWire = collab_server.getATextForWire(pad, r.revNum);
    result = {atext:forWire.atext, apool:forWire.apool,
              historicalAuthorData:forWire.historicalAuthorData};
    return r;
  }, "r");

  response.setContentType('text/plain; charset=utf-8');
  response.write(fastJSON.stringify(result));
}

// Creates a fork of a pad
function render_fork_both(opt_padId) {
  var padId = opt_padId || request.params.padId;
  if (!padId) {
    var parts = request.path.split('/');
    padId = parts[4];
  }
  var userId = getSessionProAccount().id;
  var newPadId = padId + "_" + randomUniquePadId();

  var atext = {};
  var apool = {};
  var rev = 0;
  var authorDatas = {};

  padutils.accessPadLocal(padId, function(pad) {
    atext = pad.atext();
    apool = pad.pool().copy();
    rev = pad.getHeadRevisionNumber();

    pad.eachATextAuthor(atext, function (author, authorNum) {
      authorDatas[author] = pad.getAuthorData(author);
    });
  });

  padutils.accessPadLocal(newPadId, function(pad) {
    pad.create();
    collab_server.setPadAText(pad, atext, apool);
    pad.setForkedFrom({'padId':padId, 'rev': rev});
    for (author in authorDatas) {
      pad.setAuthorData(author, authorDatas[author]);
    }
    pad.setSyndicationUpToDateRev(pad.getHeadRevisionNumber());
  });

  response.redirect('/'+newPadId);
}

// request a merge
function render_request_merge_post() {
  var padId = request.params.padId;

  var cs = null;
  var forkInfo = null;
  padutils.accessPadLocal(padId, function(pad) {
    var headRev = pad.getHeadRevisionNumber();
    forkInfo = pad.getForkedFrom();
    changes.sendMergeRequestEmail(pad, forkInfo, 2, headRev);
  });
  pro_padmeta.accessProPadLocal(padId, function(propad) {
    // fixme: redirect back to original pad
    propad.markDeleted();
  });


  renderJSON({success:true, padURL:'/'+forkInfo.padId});
}

// perform the merge (via clicking on a link in email)
// requires csrf protection
function render_merge_both() {
  var sourcePadId = request.params.padId;

  var cs = null;
  var forkInfo = null;
  var authorDatas = {};
  var oldPool = null;
  padutils.accessPadLocal(sourcePadId, function(pad) {
    forkInfo = pad.getForkedFrom();
    var headRev = pad.getHeadRevisionNumber();
    cs = pad.getChangesetBetweenRevisions(2, headRev);
    oldPool = pad.pool();
    var atext = pad.atext();
    pad.eachATextAuthor(atext, function (author, authorNum) {
      authorDatas[author] = pad.getAuthorData(author);
    });
  });

  var globalPadId = padutils.getGlobalPadId(forkInfo.padId);
  pro_padmeta.accessProPad(globalPadId, function(propad) {
    if (propad.getCreatorId() != getSessionProAccount().id && !getSessionProAccount().isAdmin) {
      response.setStatusCode(403);
      response.write("Access denied");
      response.stop();
    }
  });

  //
  padutils.accessPadLocal(forkInfo.padId, function(pad) {
    // move the authors to the new pool
    cs = Changeset.moveOpsToNewPool(cs, oldPool, pad.pool() )

    // apply the edits
    collab_server.applyUserChanges(pad, forkInfo.rev, cs);

    // for any authors for whom we don't have data, set the data
    var atext = pad.atext();
    pad.eachATextAuthor(atext, function (author, authorNum) {
      if (!pad.getAuthorData(author)) {
        pad.setAuthorData(author, authorDatas[author]);
      }
    });
  });

  response.redirect('/'+forkInfo.padId);
}


//----------------------------------------------------------------
// reconnect
//----------------------------------------------------------------

function _recordDiagnosticInfo(padId, diagnosticInfoJson) {

  var diagnosticInfo = {};
  try {
    diagnosticInfo = fastJSON.parse(diagnosticInfoJson);
  } catch (ex) {
    log.warn("Error parsing diagnosticInfoJson: "+ex);
    diagnosticInfo = {error: "error parsing JSON"};
  }

  // ignore userdups, unauth
  if (diagnosticInfo.disconnectedMessage == "userdup" ||
      diagnosticInfo.disconnectedMessage == "unauth") {
    return;
  }

  var d = new Date();

  diagnosticInfo.date = +d;
  diagnosticInfo.strDate = String(d);
  diagnosticInfo.clientAddr = request.clientAddr;
  diagnosticInfo.padId = padId;
  diagnosticInfo.headers = {};
  eachProperty(request.headers, function(k,v) {
    diagnosticInfo.headers[k] = v;
  });

  var uid = diagnosticInfo.uniqueId;

  sqlbase.putJSON("PAD_DIAGNOSTIC", (diagnosticInfo.date)+"-"+uid, diagnosticInfo);

}

function recordMigratedDiagnosticInfo(objArray) {
  objArray.forEach(function(obj) {
    sqlbase.putJSON("PAD_DIAGNOSTIC", (obj.date)+"-"+obj.uniqueId, obj);
  });
}

function render_reconnect_both() {
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var userId = padusers.getUserId();
  var hasClientErrors = false;
  var uniqueId;
  var errorMessage;

  if (!localPadId) {
    // handle refreshes more gracefully
    response.redirect('/');
  }

  try {
    var obj = fastJSON.parse(request.params.diagnosticInfo);
    uniqueId = obj.uniqueId;
    errorMessage = obj.disconnectedMessage;
    hasClientErrors = obj.collabDiagnosticInfo.errors.length > 0;
  } catch (e) {
    // guess it doesn't have errors.
  }

  log.custom("reconnect", {globalPadId: globalPadId, userId: userId,
                           uniqueId: uniqueId,
                           hasClientErrors: hasClientErrors,
                           errorMessage: errorMessage });

  try {
    _recordDiagnosticInfo(globalPadId, request.params.diagnosticInfo);
  } catch (ex) {
    log.warn("Error recording diagnostic info: "+ex+" / "+request.params.diagnosticInfo);
  }

  try {
    _applyMissedChanges(localPadId, request.params.missedChanges);
  } catch (ex) {
    log.warn("Error applying missed changes: "+ex+" / "+request.params.missedChanges);
  }

  response.write("OK");
}

/* posted asynchronously by the client as soon as reconnect dialogue appears. */
function render_connection_diagnostic_info_post() {
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var userId = padusers.getUserId();
  var hasClientErrors = false;
  var uniqueId;
  var errorMessage;
  try {
    var obj = fastJSON.parse(request.params.diagnosticInfo);
    uniqueId = obj.uniqueId;
    errorMessage = obj.disconnectedMessage;
    hasClientErrors = obj.collabDiagnosticInfo.errors.length > 0;
  } catch (e) {
    // guess it doesn't have errors.
  }
  log.custom("disconnected_autopost", {globalPadId: globalPadId, userId: userId,
                                       uniqueId: uniqueId,
                                       hasClientErrors: hasClientErrors,
                                       errorMessage: errorMessage});

  try {
    _recordDiagnosticInfo(globalPadId, request.params.diagnosticInfo);
  } catch (ex) {
    log.warn("Error recording diagnostic info: "+ex+" / "+request.params.diagnosticInfo);
  }
  response.setContentType('text/plain; charset=utf-8');
  response.write("OK");
}

function _applyMissedChanges(localPadId, missedChangesJson) {
  var missedChanges;
  try {
    missedChanges = fastJSON.parse(missedChangesJson);
  } catch (ex) {
    log.warn("Error parsing missedChangesJson: "+ex);
    return;
  }

  padutils.accessPadLocal(localPadId, function(pad) {
    if (pad.exists()) {
      collab_server.applyMissedChanges(pad, missedChanges);
    }
  });
}

//----------------------------------------------------------------
// feedback
//----------------------------------------------------------------

function render_feedback_post() {
  var feedback = request.params.feedback + (request.params.hiddenfeedback || "");
  var localPadId = request.params.padId;
  var globalPadId = padutils.getGlobalPadId(localPadId);
  var username = request.params.username;
  var email = request.params.email;
  var src = request.params.src;
  var topic = request.params.topic;
  var subject = request.params.subject;
  var requestDomainRecord = domains.getRequestDomainRecord();

  if (getSessionProAccount()) {
    username = getSessionProAccount().fullName;
    email = getSessionProAccount().email;
  }

  subject = topic && subject ? '[' + topic + '] ' + subject :
      appjet.config.customBrandingName + ' Feedback';

  var prefix = "";
//  prefix += ("IP: "+ request.clientAddr + "\n");
  prefix += ("Site: "+ (requestDomainRecord&&requestDomainRecord.id>1 ? requestDomainRecord.subDomain : "www") + "\n");
  prefix += ("Pad: "+ localPadId + "\n");
  prefix += ("User Agent: "+request.headers['User-Agent'] + "\n");
//  prefix += ("Session Referer: "+getSession().initialReferer + "\n");
  prefix += ("Email: "+email+"\n");
  if (src) {
    prefix += ("Source: "+src+"\n");
  }
  prefix += "\n";

  feedback = (prefix + feedback);

  // log feedback
  var userId = padusers.getUserId();
  log.custom("feedback", {
    globalPadId: globalPadId,
    userId: userId,
    email: email,
    username: username,
    feedback: request.params.feedback});

  sendEmail(
    helpers.supportEmailAddress(),
    pro_utils.getEmailFromAddr(),
    subject,
    {'Reply-To': email || helpers.supportEmailAddress()},
    feedback
  );

  if (request.params.confirm) {
    var msg= DIV({style: "font-size: 16pt; margin: 20px 20px; padding: 1em;"},
        P({style: "margin-bottom:20px"}, "Thanks!  Your feedback has been sent to the team."));
    msg.push(A({href:'/'}, "Return to the homepage."));
    renderNoticeString(msg);
    response.stop();
  }

  response.write("OK");
  return true;
}

//----------------------------------------------------------------
// hackpadinvite & hackpadgroupinvite
//----------------------------------------------------------------

function enforceDailyLimit(limitName, cacheKey, dailyLimit) {
  var reachedLimit = false;
  var currentUTCMillis = (new Date()).valueOf();
  syncedWithCache(limitName, function(cache) {
    var oneDayMillis = 24*60*60*1000;
    var currentDayMidnight = currentUTCMillis - (currentUTCMillis % oneDayMillis);
    var invitesCacheInfo = cache[cacheKey];
    if (invitesCacheInfo && invitesCacheInfo.date === currentDayMidnight) {
      invitesCacheInfo.count++;
      reachedLimit = invitesCacheInfo.count > dailyLimit;
    } else {
      cache[cacheKey] = { date: currentDayMidnight, count: 1 };
    }
  });

  if (reachedLimit) {
    // throttle our logging at once every 2s, so spam doesn't create issues
    syncedWithCache(limitName + "-throttleLog", function(cache) {
      // log counts at max 1/second - so we log the time and counts
      // maps cache key to "date" and "count" keys
      var rateLimitCacheInfo = cache[cacheKey] || { count: 0, last: 0 };
      rateLimitCacheInfo.count++;
      // log every 2s
      if (currentUTCMillis - rateLimitCacheInfo.last > 2000) {
        log.custom("rate-limit", {
          message: "Rate Limit",
          identifier: cacheKey,
          clientAddr: request.clientAddr,
          count: rateLimitCacheInfo.count
        });
        rateLimitCacheInfo.count = 0;
      }
      rateLimitCacheInfo.last = currentUTCMillis;
      cache[cacheKey] = rateLimitCacheInfo;
    });
    response.write("Reached maximum daily invites");
    response.stop();
  }
}

function render_hackpadinvite_post() {
  var padId = requireParam("padId");
  var userId = request.params.encryptedUserId;
  if (userId) {
    userId = pro_accounts.getUserIdByEncryptedId(userId);
  } else {
    log.warn('hackpadinvite with a non-encrypted userId');
    userId = requireParam("userId");
  }

  var hostAccount = getSessionProAccount();
  if (sessions.isAnEtherpadAdmin() && request.params.asUserId) {
    hostAccount = pro_accounts.getAccountById(request.params.asUserId);
  }

  // max invites per day = 100
  enforceDailyLimit("hackpadDailyInvites", "acct-" + hostAccount.id, 100);

  var existingAccount = pro_accounts.getAccountById(userId);
  if (!existingAccount) {
    response.write("Invalid userId parameter");
    response.stop();
  }

  padutils.accessPadLocal(padId, function(pad) {
    var padTitle;
    pro_padmeta.accessProPad(pad.getId(), function(propad) {
      padTitle = propad.getDisplayTitle();
    });

    if (pro_utils.isProDomainRequest()) {
      collab_server.broadcastSiteToClientMessage({
        type: 'invite',
        inviter: getSessionProAccount().fullName,
        padId: padId,
        title: padTitle
      }, userId);
    }
  }, 'r');

  var toAddress = existingAccount.email;
  pro_invite.inviteUserToPadByEmail(padutils.getGlobalPadId(padId), toAddress,
          request.scheme, request.host, getSessionProAccount());
}

//----------------------------------------------------------------
// emailinvite
//----------------------------------------------------------------
function render_emailinvite_post() {
  var toAddress = requireParam("toAddress").toLowerCase();
  var padId = requireParam("padId");

  var toAddresses = toAddress.split(",");
  var hostAccount = getSessionProAccount();
  var userId;
  for (var i=0; i<toAddresses.length; i++) {
    // max 100 emails per day
    enforceDailyLimit("emailDailyInvites", "acct-" + hostAccount.id, 100);
    userId = pro_invite.inviteUserToPadByEmail(padutils.getGlobalPadId(padId), toAddresses[i],
          request.scheme, request.host, hostAccount);
  }

  // return link to last user invited;
  response.setContentType('text/plain; charset=utf-8');
  response.write(pro_accounts.getUserLinkById(userId));
}

//----------------------------------------------------------------
// remove-user
//----------------------------------------------------------------
function revokePadUserAccess(localPadId, userId) {
  var ret;
  // XXX: what does booting mean if != deny?

  pro_padmeta.accessProPadLocal(localPadId, function(proPad) {
    if (!proPad.exists()) {
      ret = "Pad " + padId + " does not exist";
    } else if (padusers.getAccountIdForProAuthor(userId) == proPad.getCreatorId()) {
      ret = "Cannot remove the pad owner";
    }
  });
  if (!ret) {
    padutils.accessPadLocal(localPadId, function(pad) {
      pad_security.revokePadUserAccess(pad.getId(), userId, padusers.getUserId());
      collab_server.bootUsersFromPad(pad, "unauth", function(userInfo) {
        return userInfo.userId == userId;
      });
      collab_server.announceKillUser(padutils.getGlobalPadId(localPadId), userId);
    }, "r");
  }
  return ret;
}

function render_removeuser_post() {
  var padId = requireParam("padId");
  var userId = requireParam("userId");

  var error = revokePadUserAccess(padId, userId);
  if (error) {
    return renderJSON({success:false, error:error});
  }

  // apns: send unfollow event to userId
  pro_apns.sendPushNotificationForPad(padutils.getGlobalPadId(padId), null, userId, pro_apns.APNS_HP_T_UNFOLLOW);

  return renderJSON({success:true});
}

//----------------------------------------------------------------
// chathistory
//----------------------------------------------------------------

function render_chathistory_get() {
  var padId = request.params.padId;
  var start = Number(request.params.start || 0);
  var end = Number(request.params.end || 0);
  var chatroom = request.params.chatroom || 'site';
  var result = null;
  var userId = padusers.getUserIdForProUser(getSessionProAccount().id);
  if (chatroom != 'site' && chatroom != 'pad') {
    chatroom = chatroom < userId ? chatroom + '_' + userId : userId + '_' + chatroom;
  }

  var rev = padutils.accessPadLocal(padId, function(pad) {
    result = chatarchive.getChatBlock(pad, start, end, chatroom);
  }, "r");

  response.setContentType('text/plain; charset=utf-8');
  response.write(fastJSON.stringify(result));
}

//----------------------------------------------------------------
// debug
//----------------------------------------------------------------
function render_auth_logout_tracker_get() {
  // dump cookies, session to
  var cookies = request.cookies.toSource();
  var session = getSession().toSource();
  log.custom("error", cookies + "\n" + session);

}


//----------------------------------------------------------------
// migrate-to
//----------------------------------------------------------------
function render_migrate_to_both() {
  var padId = requireParam("padId");
  var domainId = requireParam("domainId");

  function _return_error(error) {
    renderJSON({success:false, error: error});
    response.stop();
  }

  if (isNaN(parseInt(domainId))){
    _return_error("Not a valid destination domain");
  }

  // load the domain
  var domainRecord = domains.getDomainRecord(domainId);
  if (!domainRecord) {
    _return_error("Not a valid destination domain");
  }

  var creatorId = null;
  var subdomainAccount = null;
  var host = null;

  try {
    // keep in sync with group_control.js:render_migrate_to
    host = pro_utils.getFullSuperdomainHost();
    if (domains.getPrimaryDomainId() != domainRecord.id) {
      host = domainRecord.subDomain+"."+host;
    }
    var resp = netutils.urlGet(
      (appjet.config.useHttpsUrls ? "https://" : "http://") + host +
      "/ep/api/lookup-session", {},
      { Cookie: request.headers['Cookie']});
    subdomainAccount = fastJSON.parse(resp.content);
  } catch (ex) {
    log.logException(ex);
    _return_error("Must be logged into both sites");
  }

  if (!subdomainAccount || !subdomainAccount.proAccount || !subdomainAccount.proAccount.id) {
    _return_error("Must be logged into both sites");
  }
  creatorId = subdomainAccount.proAccount.id;
  if (creatorId == getSessionProAccount().id) {
    _return_error("Must be logged into both sites");
  }

  var oldGlobalPadId = padutils.getGlobalPadId(padId);
  pro_padmeta.accessProPad(oldGlobalPadId, function(propad) {
    if (!pad_security.checkIsPadAdmin(propad)) {
      _return_error("You are not the owner of this pad.  You can only move pads that you own.");
    }
  });


  if (!request.params.moveUsers) {
    renderJSON({success:false, verify: true, error: "Need to Verify",
      numPads: 1,
      orgName: domainRecord.orgName,
      padId: padId,
      domainId: domainId,
      domainName: host,
      users: domain_migration.getPadUserNamesToMigrate(oldGlobalPadId)});
    return true;
  }

  domain_migration.migratePadsAndUsers([oldGlobalPadId], null, null, domainId, creatorId, null, true, getSessionProAccount().id);

  renderJSON({success:true});
  return true;
}

//----------------------------------------------------------------
// apply-missed-changes
//----------------------------------------------------------------
function render_apply_missed_changes_post() {
  var missedChanges = requireParam('missedChanges');
  var padId = requireParam('padId');

  try {
    _applyMissedChanges(padId, missedChanges);
  } catch (ex) {
    log.warn("Error applying missed changes: "+ex+" / "+missedChanges);
    renderJSONError(403, 'Could not apply changes.')
  }
  return renderJSON({success:true});
}
