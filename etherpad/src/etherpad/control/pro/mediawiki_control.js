import("stringutils.md5");
import("etherpad.pro.pro_config");
import("funhtml.*");
import("etherpad.utils.*");
import("etherpad.pad.pad_security");

function _modalDialog(title, content) {
  return "" + DIV({className:"modaldialog"}, DIV({className:"modaldialog-inner"}, H1({}, title), DIV({}, content)));
}

function onRequest() {
  //handle: /ep/mwproxy/destination.extension
  var pathParts = request.path.split('/');
  var destination = pathParts.slice(3).join("/");

  //make sure the destination is within Hackpad, just
  //to prevent people from abusing the ep/mwproxy
  //endpoint for phishing attacks
  destination = pad_security.sanitizeContUrl(destination);

  if (destination.match(/^https?:\/\//)) {
    response.redirect(destination);
  }

  // this is a hack: mediawiki is weird re spaces
  destination = destination.replace(/%20/g, "_");

  var mwRoot = pro_config.getConfig().mwRoot;
  var hash = md5(destination);
  var prefix = hash.substring(0,1) +"/"+ hash.substring(0,2);

  var imgRe = new RegExp("[^\\s]+\.png|jpg|jpeg|gif$");
  var imgMatch = destination.match(imgRe);

  if (mwRoot) {
    if (mwRoot[mwRoot.length-1] == "/") {
      mwRoot = mwRoot.substring(0, mwRoot.length-1);
    }
    response.redirect(mwRoot + "/images/" + prefix + "/" + destination);
  } else {
    if (imgMatch) {
      renderNoticeString("Broken Mediawiki");
    } else {
      renderNoticeString("Please configure your mediawiki root <a href='/ep/admin/pro-config/'>here</a>");
    }
  }
  return true;
}
