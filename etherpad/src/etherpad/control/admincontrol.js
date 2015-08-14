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

import("fastJSON");
import("netutils");
import("funhtml");
import("funhtml.*");
import("stringutils.{html,sprintf,startsWith,md5,trim}");
import("jsutils.*");
import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("varz");
import("comet");
import("email.sendEmail");
import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");

import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.utils.*");
import("etherpad.sessions.getSession");
import("etherpad.sessions");
import("etherpad.statistics.statistics");
import("etherpad.log");
import("etherpad.admin.shell");
import("etherpad.admin.sites");
import("etherpad.usage_stats.usage_stats");
import("etherpad.control.pro_beta_control");
import("etherpad.control.statscontrol");
import("etherpad.changes.follow");
import("etherpad.statistics.clientside_errors");
import("etherpad.statistics.exceptions");

import("etherpad.pad.activepads");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.pad_access");
import("etherpad.pad.dbwriter");
import("etherpad.collab.collab_server");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_accounts.getSessionProAccount");
import("etherpad.pro.pro_apns");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.pro_padmeta.accessProPad");
import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");
import("etherpad.pro.domain_migration");
import("etherpad.control.admin.recovercontrol");
import("etherpad.control.admin.admin_email_control");
import("etherpad.control.admin.admin_download_user_data");
import("etherpad.control.pro.admin.account_manager_control");


import("etherpad.pad.padutils");
import('etherpad.pro.pro_padmeta');
import("etherpad.pad.exporthtml");

jimport("java.lang.System.out.println");

jimport("net.appjet.oui.cometlatencies");
jimport("net.appjet.oui.appstats");
jimport("org.mindrot.BCrypt");


//----------------------------------------------------------------

function onRequest(name) {
  pro_accounts.requireSuperAdminAccount();

  var disp = new Dispatcher();

  disp.addLocations([
    [PrefixMatcher('/admin/email/'), forward(admin_email_control)],
    [PrefixMatcher('/admin/download-user-data/'), forward(admin_download_user_data)],
    [PrefixMatcher('/admin/recover/'), forward(recovercontrol)],
    [PrefixMatcher('/admin/shell'), forward(shell)],
    [PrefixMatcher('/admin/usagestats/'), forward(statscontrol)],
    [DirMatcher('/admin/account-manager/'), forward(account_manager_control)],
    [DirMatcher('/admin/sites/'), forward(sites)],
  ]);

  return disp.dispatch();
}

function _commonHead() {
  return HEAD(STYLE(
    "html {font-family:Verdana,Helvetica,sans-serif;}",
    "body {padding: 2em;}"
  ));
}

//----------------------------------------------------------------

function render_main_get() {
  renderHtml("admin/page.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
   });
}

//----------------------------------------------------------------

function render_config_get() {

  vars = [];
  eachProperty(appjet.config, function(k,v) {
    vars.push(k);
  });

  vars.sort();

  body = PRE()
  vars.forEach(function(v) {
    body.push("appjet.config."+v+" = "+appjet.config[v]+"\n");
  });

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Config',
    content: body
   });
}

//----------------------------------------------------------------


function render_dashboard_get() {
  var body = BODY();
  body.push(H1({style: "border-bottom: 1px solid black;"}, "Dashboard"));

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Uptime"));
  body.push(P({style: "margin-left: 25px;"}, "Server running for "+renderServerUptime()+"."))

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Response codes"));
  body.push(renderResponseCodes());

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Comet Connections"));
  body.push(renderPadConnections());

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Comet Stats"));
  body.push(renderCometStats());

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Dashboard',
    content: body
   });
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderPadConnections() {
  var d = DIV();
  var lastCount = cometlatencies.lastCount();

  if (lastCount.isDefined()) {
    var countMap = {};
    lastCount.get().foreach(scalaF1(function(x) {
      countMap[x._1()] = x._2();
    }));

    var totalConnected = 0;
    var ul = UL();
    eachProperty(countMap, function(k,v) {
      ul.push(LI(k+": "+v));
      if (/^\d+$/.test(v)) {
        totalConnected += Number(v);
      }
    });
    ul.push(LI(B("Total: ", totalConnected)));
    d.push(ul);
  } else {
    d.push("Still collecting data... check back in a minute.");
  }
  return d;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderCometStats() {
  var d = DIV();
  var lastStats = cometlatencies.lastStats();
  var lastCount = cometlatencies.lastCount();


  if (lastStats.isDefined()) {
    d.push(P("Realtime transport latency percentiles (microseconds):"));
    var ul = UL();
    lastStats.map(scalaF1(function(s) {
      ['50', '90', '95', '99', 'max'].forEach(function(id) {
        var fn = id;
        if (id != "max") {
          fn = ("p"+fn);
          id = id+"%";
        }
        ul.push(LI(id, ": <", s[fn](), html("&micro;"), "s"));
      });
    }));
    d.push(ul);
  } else {
    d.push(P("Still collecting data... check back in a minutes."));
  }

 /*    ["p50", "p90", "p95", "p99", "max"].forEach(function(id) {
        ul.push(LI(B(

      return DIV(P(sprintf("50%% %d\t90%% %d\t95%% %d\t99%% %d\tmax %d",
                     s.p50(), s.p90(), s.p95(), s.p99(), s.max())),
                 P(sprintf("%d total messages", s.count())));
    }})).get();*/


  return d;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderResponseCodes() {
  var statusCodeFrequencyNames = ["minute", "hour", "day", "week"];
  var data = { };
  var statusCodes = appstats.stati();
  for (var i = 0; i < statusCodes.length; ++i) {
    var name = statusCodeFrequencyNames[i];
    var map = statusCodes[i];
    map.foreach(scalaF1(function(pair) {
      if (! (pair._1() in data)) data[pair._1()] = {};
      var scmap = data[pair._1()];
      scmap[name] = pair._2().count();
    }));
  };
   var stats = TABLE({id: "responsecodes-table", style: "margin-left: 25px;",
                     border: 1, cellspacing: 0, cellpadding: 4},
                     TR.apply(TR, statusCodeFrequencyNames.map(function(name) {
    return TH({colspan: 2}, "Last", html("&nbsp;"), name);
  })));
  var sortedStati = [];
  eachProperty(data, function(k) {
    sortedStati.push(k);
  });
  sortedStati.sort();
  sortedStati.forEach(function(k, i) { // k is status code.
    var row = TR();
    statusCodeFrequencyNames.forEach(function(name) {
      row.push(TD({style: 'width: 2em;'}, data[k][name] ? k+":" : ""));
      row.push(TD(data[k][name] ? data[k][name] : ""));
    });
    stats.push(row);
  });
  return stats;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderServerUptime() {
  var labels = ["seconds", "minutes", "hours", "days"];
  var ratios = [60, 60, 24];
  var time = appjet.uptime / 1000;
  var pos = 0;
  while (pos < ratios.length && time / ratios[pos] > 1.1) {
    time = time / ratios[pos];
    pos++;
  }
  return sprintf("%.1f %s", time, labels[pos]);
}

//----------------------------------------------------------------
// Broadcasting Messages
//----------------------------------------------------------------

function render_broadcast_message_get() {
  var body = FORM({action: request.path, method: 'post'},
		  H3('Broadcast Message to All Active Pad Clients:'),
      INPUT({type:'hidden', name:'xsrf', value: helpers.xsrfToken()}),
		  TEXTAREA({name: 'msgtext', style: 'width: 100%; height: 100px;'}),
		  H3('JavaScript code to be eval()ed on client (optional, be careful!): '),
		  TEXTAREA({name: 'jscode', style: 'width: 100%; height: 100px;'}),
		  INPUT({type: 'submit', value: 'Broadcast Now'}));
  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Broadcast message',
    content: body
   });
}

function render_broadcast_message_post() {
  var msgText = request.params.msgtext;
  var jsCode = request.params.jscode;
  if (!(msgText || jsCode)) {
    response.write("No mesage text or jscode specified.");
    response.stop();
    return;
  }
  collab_server.broadcastServerMessage({
    type: 'NOTICE',
    text: msgText,
    js: jsCode
  });
  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Broadcast message',
    content: P("OK")
   });
}


//----------------------------------------------------------------
// pad inspector
//----------------------------------------------------------------

function _getPadUrl(globalPadId) {
  var superdomain = pro_utils.getRequestSuperdomain();
  var domain;
  if (padutils.isProPadId(globalPadId)) {
    var domainId = padutils.getDomainId(globalPadId);
    domain = domains.getDomainRecord(domainId).subDomain +
      '.' + superdomain;
  }
  else {
    domain = superdomain;
  }
  var localId = padutils.globalToLocalId(globalPadId);
  return "http://"+httpHost(domain)+"/"+localId;
}

function render_revert_post() {
  var padId = request.params.padId;
  var revNum = request.params.revNum;

  model.rollbackToRevNum(padId, revNum);
  response.redirect('/admin/padinspector?padId='+padId+"&revtext=HEAD");
}

function render_padinspector_get() {
  var padId = request.params.padId;
  if (!padId) {
    var div = DIV();
    div.push(FORM({action: request.path, method: 'get', style: 'border: 1px solid #ccc; background-color: #eee; padding: .2em 1em;'},
                        P("Pad Lookup:  ",
                          INPUT({name: 'padId', value: '<enter pad id>'}),
                          INPUT({type: 'submit'}))));

    // show recently active pads;  the number of them may vary;  lots of
    // activity in a pad will push others off the list
    div.push(H3("Recently Active Pads:"));
    var recentlyActiveTable = TABLE({cellspacing: 0, cellpadding: 6, border: 1 });
    var recentPads = activepads.getActivePads();
    recentPads.forEach(function (info) {
      var time = info.timestamp; // number
      var pid = info.padId;
      model.accessPadGlobal(pid, function(pad) {
        if (pad.exists()) {
          var numRevisions = pad.getHeadRevisionNumber();
          var connected = collab_server.getNumConnections(pad);
          recentlyActiveTable.push(
            TR(TD(B(pid)),
               TD({style: 'font-style: italic;'}, timeAgo(time)),
               TD(connected+" connected"),
               TD(numRevisions+" revisions"),
               TD(A({href: qpath({padId: pid, revtext: "HEAD"})}, "HEAD")),
               TD(A({href: qpath({padId: pid})}, "inspect"))
              ));
        }
      }, "r");
    });
    div.push(recentlyActiveTable);
    renderHtml("admin/dynamic.ejs", {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Pad inspector',
      content: div
    });
    return;
  }
  if (startsWith(padId, '/')) {
    padId = padId.substr(1);
  }
  if (request.params.setsupportstimeslider) {
    var v = (String(request.params.setsupportstimeslider).toLowerCase() ==
             'true');
    model.accessPadGlobal(padId, function(pad) {
      pad.setSupportsTimeSlider(v);
    });
    response.write("on pad "+padId+": setSupportsTimeSlider("+v+")");
    response.stop();
  }
  model.accessPadGlobal(padId, function(pad) {
    if (! pad.exists()) {
      response.write("Pad not found: /"+padId);
      response.stop();
    }

    var headRev = pad.getHeadRevisionNumber();
    var div = DIV();

    if (request.params.revtext) {
      var i;
      if (request.params.revtext == "HEAD") {
        i = headRev;
      } else {
        i = Number(request.params.revtext);
      }
      var infoObj = {};
      div.push(H3(A({href: request.path}, "PadInspector"),
                  ' > ', A({href: request.path+'?padId='+padId}, "/"+padId),
                  ' > ', "Revision ", i, "/", headRev,
                  SPAN({style: 'color: #949;'}, ' ', pad.getRevisionDate(i).toLocaleDateString() + pad.getRevisionDate(i).toLocaleTimeString())));
      div.push(H3("Browse Revisions: ",
                  ((i > 0) ? A({id: 'previous', href: qpath({revtext: (i-1)})}, '<< previous') : ''),
                  '   ',
                  ((i < pad.getHeadRevisionNumber()) ? A({id: 'next', href: qpath({revtext:(i+1)})}, 'next >>') : '')),
              funhtml.FORM({action: '/admin/revert', method: 'POST'},
                helpers.xsrfTokenElement(),
                funhtml.INPUT({type: 'hidden', name:'padId', value:padId}),
                funhtml.INPUT({type: 'hidden', name:'revNum', value:i}),
                funhtml.INPUT({type: 'submit', name:'submit', value:'Revert to here' })),

              DIV({style: 'padding: 1em; border: 1px solid #ccc;'},
                   pad.getRevisionText(i, infoObj)));

      if (infoObj.badLastChar) {
        div.push(P("Bad last character of text (not newline): "+infoObj.badLastChar));
      }
    } else if (request.params.dumpstorage) {
      div.push(P(collab_server.dumpStorageToString(pad)));
    } else if (request.params.showlatest) {
      div.push(P(pad.text()));
    } else {
      div.push(H2(A({href: request.path}, "PadInspector"), ' > ', "/"+padId));
      // no action
      div.push(P(A({href: qpath({revtext: 'HEAD'})}, 'HEAD='+headRev)));
      div.push(P(A({href: qpath({dumpstorage: 1})}, 'dumpstorage')));
      div.push(P(A({href: '/admin/recover/analyze?globalPadiId=' + pad.getId()}, 'analyze')));
      var supportsTimeSlider = pad.getSupportsTimeSlider();
      if (supportsTimeSlider) {
        div.push(P(A({href: qpath({setsupportstimeslider: 'false'})}, 'hide slider')));
      }
      else {
        div.push(P(A({href: qpath({setsupportstimeslider: 'true'})}, 'show slider')));
      }
    }

    var script = SCRIPT({type: 'text/javascript', nonce: helpers.cspNonce() }, html([
      '$(document).keydown(function(e) {',
      '  var h = undefined;',
      '  if (e.keyCode == 37) { h = $("#previous").attr("href"); }',
      '  if (e.keyCode == 39) { h = $("#next").attr("href"); }',
      '  if (h) { window.location.href = h; }',
      '});'
    ].join('\n')));

    renderHtml("admin/dynamic.ejs",
     {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Pad inspector',
      content: DIV(div, script)
     });
  }, "r");
}


//----------------------------------------------------------------
// eepnet license display
//----------------------------------------------------------------

function render_eepnet_licenses_get() {
  var data = sqlobj.selectMulti('eepnet_signups', {}, {orderBy: 'date'});
  var t = TABLE({border: 1, cellspacing: 0, cellpadding: 2});
  var cols = ['date','email','orgName','firstName','lastName', 'jobTitle','phone','estUsers'];
  data.forEach(function(x) {
    var tr = TR();
    cols.forEach(function(colname) {
      tr.push(TD(x[colname]));
    });
    t.push(tr);
  });
  response.write(HTML(BODY({style: 'font-family: monospace;'}, t)));
}

//----------------------------------------------------------------
// pad integrity
//----------------------------------------------------------------

/*function render_changesettest_get() {
  var nums = [0, 1, 2, 3, 0xfffffff, 0x02345678, 4];
  var str = Changeset.numberArrayToString(nums);
  var result = Changeset.numberArrayFromString(str);
  var resultArray = result[0];
  var remainingString = result[1];
  var bad = false;
  if (remainingString) {
    response.write(P("remaining string length is: "+remainingString.length));
    bad = true;
  }
  if (nums.length != resultArray.length) {
    response.write(P("length mismatch: "+nums.length+" / "+resultArray.length));
    bad = true;
  }
  response.write(P(nums[2]));
  for(var i=0;i<nums.length;i++) {
    var a = nums[i];
    var b = resultArray[i];
    if (a !== b) {
      response.write(P("mismatch at element "+i+": "+a+" / "+b));
      bad = true;
    }
  }
  if (! bad) {
    response.write("SUCCESS");
  }
}*/

/////////


function render_varz_get() {
  var varzes = varz.getSnapshot();

  var body = PRE();
  for (var k in varzes) {
    body.push(k+': '+JSON.stringify(varzes[k])+'\n');
  }

  response.write(body);
}


function _diagnosticRecordToHtml(obj) {
  function valToHtml(o, noborder) {
    if (typeof (o) != 'object') {
      return String(o);
    }
    var t = TABLE((noborder ? {} : {style: "border-left: 1px solid black; border-top: 1px solid black;"}));
    if (typeof (o.length) != 'number') {
      eachProperty(o, function(k, v) {
        var tr = TR();
        tr.push(TD({valign: "top", align: "right"}, B(k)));
        tr.push(TD(valToHtml(v)));
        t.push(tr);
      });
    } else {
      if (o.length == 0) return "(empty array)";
      for (var i = 0; i < o.length; ++i) {
        var tr = TR();
        tr.push(TD({valign: "top", align: "right"}, B(i)));
        tr.push(TD(valToHtml(o[i])));
        t.push(tr);
      }
    }
    return t;
  }
  return valToHtml(obj, true);
}

function render_diagnostics_get() {
  var start = Number(request.params.start || 0);
  var count = Number(request.params.count || 100);
  var diagnostic_entries = sqlbase.getAllJSON("PAD_DIAGNOSTIC", start, count);
  var expandArray = request.params.expand || [];

  if (typeof (expandArray) == 'string') expandArray = [expandArray];
  var expand = {};
  for (var i = 0; i < expandArray.length; ++i) {
    expand[expandArray[i]] = true;
  }

  function makeLink(text, expand, collapse, start0, count0) {
    start0 = (typeof(start0) == "number" ? start0 : start);
    count0 = count0 || count;
    collapse = collapse || [];
    expand = expand || [];

    var collapseObj = {};
    for (var i = 0; i < collapse.length; ++i) {
      collapseObj[collapse[i]] = true;
    }
    var expandString =
      expandArray.concat(expand).filter(function(x) { return ! collapseObj[x] }).map(function(x) { return "expand="+encodeURIComponent(x) }).join("&");

    var url = request.path + "?start="+start0+"&count="+count0+"&"+expandString+(expand.length == 1 ? "#"+md5(expand[0]) : "");

    return A({href: url}, text);
  }

  var t = TABLE({border: 1, cellpadding: 2, style: "font-family: monospace;"});
  diagnostic_entries.forEach(function(ent) {
    var tr = TR()
    tr.push(TD({valign: "top", align: "right"}, (new Date(Number(ent.id.split("-")[0]))).toString()));
    tr.push(TD({valign: "top", align: "right"}, ent.id));
    if (expand[ent.id]) {
      tr.push(TD(A({name: md5(ent.id)}, makeLink("(collapse)", false, [ent.id])), BR(),
                 _diagnosticRecordToHtml(ent.value)));
    } else {
      tr.push(TD(A({name: md5(ent.id)}, makeLink(_diagnosticRecordToHtml({padId: ent.value.padId, disconnectedMessage: ent.value.disconnectedMessage}), [ent.id]))));
    }
    t.push(tr);
  });

  var body = DIV();
  body.push(P("Showing entries ", start, "-", start+diagnostic_entries.length, ". ",
              (start > 0 ? makeLink("Show previous "+count+".", [], [], start-count) : ""),
              (diagnostic_entries.length == count ? makeLink("Show next "+count+".", [], [], start+count) : "")));
  body.push(t);

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Diagnostics',
    content: body
   });
}

//----------------------------------------------------------------

import("etherpad.pad.pad_migrations");

function render_padmigrations_both() {
  var residue = (request.params.r || 0);
  var modulus = (request.params.m || 1);
  var name = (request.params.n || (residue+"%"+modulus));
  pad_migrations.runBackgroundMigration(residue, modulus, name);
  response.write("done");
  return true;
}

// TODO: show sizes?
function render_cachebrowser_get() {
  var path = request.params.path;
  if (path && path.charAt(0) == ',') {
    path = path.substr(1);
  }
  var pathArg = (path || "");
  var c = appjet.cache;
  if (path) {
    var cparent, cpart;
    path.split(",").forEach(function(part) {
      cparent = c;
      cpart = part;
      c = c[part];
    });

    if (c && request.params["delete"]) {
      delete cparent[cpart];
      response.redirect(qpath({"delete": null, path: pathArg.substr(0, pathArg.lastIndexOf(","))}));
    }
  }

  var d = DIV({style: 'font-family: monospace; text-decoration: none;'});

  d.push(H3("appjet.cache    -->    "+pathArg.split(",").join("    -->    ")));
  d.push(FORM({method: "GET"},
    INPUT({name: "path", type: "hidden", "value": pathArg}),
    INPUT({name: "delete", type: "submit", "value": "Delete"})));

  var t = TABLE({border: 1});
  keys(c).sort().forEach(function(k) {
    var v = c[k];
    if (v && (typeof(v) == 'object') && (!v.getDate)) {
      t.push(TR(TD(A({style: 'text-decoration: none;',
                      href: request.path+"?path="+pathArg+","+k}, k))));
    } else {
      t.push(TR(TD(k), TD(v)));
    }
  });

  d.push(t);
  response.write(d);
}

function render_send_missed_get() {
  response.write("<form method='post'><textarea name='data'></textarea><input type='checkbox' name='send'/><input type='submit'></form>")
}

function render_send_missed_post() {
  var missedInvites = JSON.parse(request.params.data);
  var doSend = Boolean(request.params.send);

  var emailToPadsMap = {};
  for (var i=0; i<missedInvites.length; i++) {
    var missedInvite = missedInvites[i];
    var domainId = 1;
    if (missedInvite.host.split(".").length == 3) {
      var domain = domains.getDomainRecordFromSubdomain(missedInvite.host.split(".")[0]);
      domainId = domain.id;
    }
    var globalPadId = padutils.makeGlobalId(domainId, missedInvite.padId);

    //canUserIdAccess
    var account = pro_accounts.getAccountByEmail(missedInvite.toEmails, domainId);
    if (!account || !pad_access.canUserIdAccess(globalPadId, account.id)) {
      // skip deleted accounts or pads user can no longer access
      continue;
    }
    missedInvite.toEmails = missedInvite.toEmails.replace(".co", ".com")

    emailToPadsMap[missedInvite.toEmails] = emailToPadsMap[missedInvite.toEmails] || {};
    emailToPadsMap[missedInvite.toEmails][globalPadId] = missedInvite;
  }

  if (doSend) {
    response.write("Really sending emails.<br/>");
  }

  for (var toEmail in emailToPadsMap) {
    body = "Hey there, <br/><br/>";
    body += "Our sincere apologies.  Due to a bug in Hackpad, some invites were not properly delivered.  <br/><br/>";
    body += "Here are the invites you missed: <br/><br/>";
    var padListForLog = [];

    for (var globalPadId in emailToPadsMap[toEmail]) {
      var missedInvite = emailToPadsMap[toEmail][globalPadId];
      var title = "Untitled";
      accessProPad(globalPadId, function(ppad) {
        title = ppad.getDisplayTitle();
      });
      var name = null;
      if (missedInvite.hostId) {
        name = pro_accounts.getAccountById(missedInvite.hostId).fullName;
      }
      padListForLog.push(title)
      if (name) {
        body += name + " invited you to edit ";
        body += "<a href='https://" + missedInvite.host + "/" + missedInvite.padId+"#"+title+"'>"+title+"</a><br/>";
      } else {
        body += "You were invited to edit ";
        body += "<a href='https://" + missedInvite.host + "/" + missedInvite.padId+"#"+title+"'>"+title+"</a><br/>";
      }
    }

    body += "<br/>We have taken steps to make sure this doesn't happen again,  <br/>";
    body += "The Hackpad Team";
    response.write("Sent mail to " + toEmail + " about " + padListForLog.join(",") + "</br>");
    if (doSend) {
      sendEmail(toEmail, pro_utils.getEmailFromAddr(), "You've been invited to edit on Hackpad", {}, body, "text/html; charset=utf-8");
    }
  }
}


function render_pro_domain_accounts_get() {
  var accounts = sqlobj.selectMulti('pro_accounts', {}, {});
  var domains = sqlobj.selectMulti('pro_domains', {}, {});

  // build domain map
  var domainMap = {};
  domains.forEach(function(d) { domainMap[d.id] = d; });
  accounts.sort(function(a,b) { return cmp(b.lastLoginDate, a.lastLoginDate); });

  var b = DIV({style: "font-family: monospace;"});
  b.push(accounts.length + " pro accounts.");
  var t = TABLE({border: 1});
  t.push(TR(TH("email"),
            TH("domain"),
            TH("lastLogin"),
	    TH("password")));
  accounts.forEach(function(u) {
    t.push(TR(TD(u.email),
              TD(domainMap[u.domainId].subDomain+"."+request.domain),
              TD(u.lastLoginDate),
	      TD(INPUT({type: "password", name: "password_" + u.email}))));
  });

  b.push(t);
  b.push(INPUT({type: "submit", value: "Save"}));

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Pro accounts',
    content: FORM({method: "POST", action: request.path}, b)
   });

}

function render_usagestats_get() {
  response.redirect("/ep/admin/usagestats/");
}

function render_exceptions_get() {
  exceptions.render();
}

function render_clientside_errors_get() {
  clientside_errors.render();
}

function render_apns_post() {
  var body = H2('Apple Push Notification Service Tester');


  body += H3({style: 'margin-top:20px;'}, "Send Simple Notification");

  if (request.params.deviceToken && request.params.appId) {
    pro_apns.sendPushNotification(request.params.appId, request.params.deviceToken, request.params.message, {
      hp: {
        u: request.params.padUrl,
        a: request.params.accountId,
        t: request.params.eventType
      }
    }, !!request.params.padUrl);
    body += H4({style: "color: green; margin-top:20px;"}, "Pushed to device " + request.params.deviceToken);
  }

  body += FORM(
    P("App ID"), P(INPUT({type: "text", name: "appId", value: request.params.appId || pro_apns.DEBUG_APP_ID, size: 64})),
    P("Device Token"), P(INPUT({type: "text", name: "deviceToken", value: request.params.deviceToken, size: 64})),
    P("Alert Message"), P(INPUT({type: "text", name: "message", value: request.params.message, size: 64})),
    P("Pad URL"), P(INPUT({type: "text", name: "padUrl", value: request.params.padUrl, size: 64})),
    P("Account ID"), P(INPUT({type: "text", name: "accountId", value: request.params.accountId, size: 64})),
    P("Event Type"), P(SELECT({name: "eventType"},
                         OPTION({value: "c"}, "Created"),
                         OPTION({value: "d"}, "Deleted"),
                         OPTION({value: "e"}, "Edited"),
                         OPTION({value: "f"}, "Follow"),
                         OPTION({value: "u"}, "Unfollow"),
                         OPTION({value: "i"}, "Invite"),
                         OPTION({value: "m"}, "Mention"))),
    P(INPUT({type: "submit"})));


  body += H3({style: 'margin-top:20px;'}, "Send Pad Notification");

  if (request.params.globalPadId && request.params.accountId && request.params.eventType) {
    var userId = pro_accounts.getUserIdByEncryptedId(request.params.accountId);
    if (userId) {
      pro_apns.sendPushNotificationForPad(request.params.globalPadId, request.params.message, userId, request.params.eventType);
      body += H4({style: "color: green; margin-top:20px;"}, "Pushed to account " + request.params.accountId);
    } else {
      body += H4({style: "color: red; margin-top:20px;"}, "Could not find accountId " + request.params.accountId);
    }
  }

  body += FORM(
    P("Global Pad Id"), P(INPUT({type: "text", name: "globalPadId", value: request.params.globalPadId})),
    P("Account Id"), P(INPUT({type: "text", name: "accountId", value: request.params.accountId})),
    P("Alert Message"), P(INPUT({type: "text", name: "message", value: request.params.message})),
    P("Event Type"), P(SELECT({name: "eventType"},
                         OPTION({value: "c"}, "Created"),
                         OPTION({value: "d"}, "Deleted"),
                         OPTION({value: "e"}, "Edited"),
                         OPTION({value: "f"}, "Follow"),
                         OPTION({value: "u"}, "Unfollow"),
                         OPTION({value: "i"}, "Invite"),
                         OPTION({value: "m"}, "Mention"))),
    P(INPUT({type: "submit"})));


  body += H3({style: 'margin-top:20px;'}, "Process Notification Feedback");
  if (request.params.processFeedback) {
    pro_apns.processFeedback();
    body += H4({style: "color: green; margin-top:20px;"}, "Processed feedback");
  }
  body += FORM(
    P(INPUT({type: 'hidden', name: 'processFeedback', value: '1'})),
    P(INPUT({type: "submit"})));

  renderHtml("admin/dynamic.ejs",
  {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Apple Push Notification Service',
    content: body
  });
}


function render_setadminmode_post() {
  var sudoAcctIds = [ 0 /* etherpad admin */ ];

  var sudoEmailStr = appjet.config['superUserEmailAddresses'];
  if (sudoEmailStr) {
    // parse the list of super user email addresses, and normalize them
    var sudoEmailList = sudoEmails.split(",").map(function(email) {
      return trim(email).toLowerCase();
    });
    sudoEmailList = sudoEmailList.filter(function(email) {
      return email && email.indexOf('@') > -1;
    });

    // collect all account ids with a super user email
    sudoEmailList.forEach(function(email) {
      sudoAcctIds = sudoAcctIds.concat(pro_accounts.getAllAccountsWithEmail(email));
    });
  }

  if (isProduction() &&
      sudoAcctIds.indexOf(pro_accounts.getSessionProAccount().id) == -1) {
    render401("Unauthorized: Sudo Required");
  }

  sessions.setIsAnEtherpadAdmin(
    String(request.params.v).toLowerCase() == "true");
  response.redirect("/admin/");
}
