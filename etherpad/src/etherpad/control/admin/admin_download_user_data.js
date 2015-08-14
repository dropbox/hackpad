import("jsutils")
import("underscore._");
import ("funhtml.*");

import("etherpad.sessions.{isAnEtherpadAdmin}");
import ("etherpad.utils.*");
import ("etherpad.pad.padutils");
import ("etherpad.pad.model");
import("etherpad.pad.exporthtml");
import('etherpad.pro.pro_padmeta');
import('etherpad.control.pro.pro_padlist_control');
import('etherpad.pro.pro_accounts');
import("etherpad.pro.pro_utils");
import("etherpad.log");
import("sqlbase.sqlobj");
import ("etherpad.utils");
import ("etherpad.statistics.email_tracking");

function render_main_get() {
  var body = renderTemplateAsString("admin/download_user_data.ejs");

  renderHtml("admin/dynamic.ejs",
    {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Download User Data',
      content: body
    });
}

function render_main_post() {
  if (!isAnEtherpadAdmin()) {
    response.redirect("/");
  }
  var addresses = requireParam("addresses");
  var destination = requireParam("destination");

  addresses = _.compact(addresses.split(/\r\n|\r|\n/g));

  // Make sure everything's an e-mail.
  var invalids = findInvalidEmails(addresses.concat(destination));
  if (invalids.length > 0) {
    response.write("The following are not valid e-mails: " + invalids.join(", "));
    response.stop();
    return;
  }

  pro_padlist_control.sendPadsToZip(addresses, destination, "txt")
  renderHtml("admin/dynamic.ejs",
    {
      config: appjet.config,
      bodyClass: 'nonpropad',
      title: 'Send Email',
      content: ["<h1>Success!</h1>", "<h3>You should receive an e-mail shortly.</h3>"].join("")
    });
}

function findInvalidEmails(emails) {
  return _.reject(emails, function(email) {
    var parts = email.split("@");

    // A pretty simple check -- two parts (one before and the after the @), and neither can be empty.
    return (parts.length == 2 && !_.any(parts, function(part) {
      return part.length == 0;
    }));
  });
}
