import("jsutils")
import ("funhtml.*");
import ("etherpad.utils.*");
import ("etherpad.pad.padutils");
import ("etherpad.pad.model");
import("etherpad.pad.exporthtml");
import('etherpad.pro.pro_padmeta');
import('etherpad.pro.pro_accounts');
import("etherpad.pro.pro_utils");
import("etherpad.log");
import("sqlbase.sqlobj");
import ("etherpad.utils");
import ("etherpad.statistics.email_tracking");

function render_stats_get() {
  var stats = sqlobj.executeRaw("SELECT globalPadId, sum(clicks>0) as clicks, sum(timeOpened is not NULL) as opens, count(*) as sent from email_tracking where globalPadId != '' group by globalPadId", {});
  stats.forEach(function(s){
    pro_padmeta.accessProPad(s.globalPadId, function(ppad) {
      s.title = ppad.getDisplayTitle();
      s.url = absolutePadURL(ppad.getLocalPadId());
    });
  })

  renderHtml("admin/dynamic.ejs",
     {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Email Stats',
      content: renderTemplateAsString("admin/emailstats.ejs", {stats:stats})
     });
}

function render_main_get() {
  var body = renderTemplateAsString("admin/sendemail.ejs");

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Send Email',
    content: body
   });
}

function render_main_post() {
  var addresses = request.params.addresses;
  var sqladdresses = request.params.sqladdresses;
  var emailType = request.params.emailtype;
  var emailVersion = request.params.emailversion;
  var campaignId = request.params.campaignid;
  var count = request.params.count;
  var really = request.params.really;
  var globalPadId = parsePadURL(request.params.pad);


  if (!(globalPadId && (sqladdresses || addresses))) {
    response.write("No mesage text or addresses specified.");
    response.stop();
    return;
  }
  addresses = addresses.split("\n");

  if (sqladdresses) {
    var r = sqlobj.executeRaw(sqladdresses, []);
    for (i in r) {
      if (r[i].email) {
        addresses.push(r[i].email);
      }
    }
  }

  var body;
  var padId;
  model.accessPadGlobal(globalPadId, function (pad) {
    body = exporthtml.getPadHTMLDocument(pad, pad.getHeadRevisionNumber(), false/*noDoctype*/, true /*removeTitleLine*/, true/*unescapeCodeFragment*/);
    padId = pad.getId();
  });
  var title;
  pro_padmeta.accessProPad(padId, function(propad) {
    title = propad.getDisplayTitle();
  });
  body = body.replace(/<img/g, "<img style='max-width: 400px; margin:auto; display: inherit;'");


  var alreadySentThis = [];
  if (campaignId) {
    alreadySentThis = email_tracking.emailAddressesWhoWereSentCampaign(addresses, campaignId);
  }
  addresses = addresses.filter(function(a) {return a && alreadySentThis.indexOf(a) == -1});
  var addessesSentTo = [];
  for (var i=0; i<addresses.length; i++) {
    if (count == 0) {
      break;
    }
    if (emailType.indexOf("product-update") == 0 && _isUnsubscribedFromProductUpdates(addresses[i])) {
      continue;
    }
    var unsubscribeUrl = absoluteSignedURL('/ep/account/settings/unsub_whats_new',
      {email: addresses[i]});
    addresses = jsutils.uniqueStrings(addresses);
    try {
      if (really) {
        var eid = email_tracking.trackEmailSent(addresses[i], email_tracking.PRODUCT_UPDATE, 1, globalPadId, campaignId);

        var bodyForSending = body.replace(/<a href='([^']+)'/g, function (match, x, offset, original ) {
          return "<a href='" + absoluteSignedURL('/clck', {eid:eid, cont: x}) + "'" ;
        })

        utils.sendHtmlTemplateEmail(addresses[i], title, 'email/manual.ejs', {content: bodyForSending, name:addresses[i], unsubscribeUrl: unsubscribeUrl, eid: eid}, pro_utils.getSupportEmailFromAddr());
      }
      addessesSentTo.push(addresses[i]);
      log.custom('sendemail', addresses[i]);
    } catch (e) {
      log.custom('sendemail', "Failed to send to:" + addresses[i]);
    }
    count = count - 1;
  }

  renderHtml("admin/dynamic.ejs",
   {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Send Email',
    content: PRE(addessesSentTo.join("\n"))
   });
}

function _isUnsubscribedFromProductUpdates(email) {
  var accts = pro_accounts.getAllAccountsWithEmail(email);
  var unsubscribed = false;
  accts.forEach(function(acct) {
    unsubscribed = unsubscribed || pro_accounts.getAccountDoesNotWantWhatsNew(acct);
  });
  return unsubscribed;
}
