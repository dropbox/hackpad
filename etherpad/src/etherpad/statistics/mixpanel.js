import("fastJSON");
import("jsutils");
import("netutils.urlPostAsync");

import("etherpad.globals.isProduction");
import("etherpad.sessions");
import("etherpad.pro.domains");


jimport("org.apache.commons.codec.binary.Base64");

var BASE_MIXPANEL_URL = "https://api.mixpanel.com";

function track(eventName, opt_properties) {
  if (!appjet.config.mixpanelToken) {
    return;
  }
  if (!isProduction()) {
    return;
  }

  var data = {
      "event": eventName,
      "properties": {
          "distinct_id": sessions.getTrackingId() || "NO-TRACKER",
          "ip": request.clientAddr,
          "token": appjet.config.mixpanelToken,
          "time": ((new Date()).getTime())/1000,
      }
  };
  if (opt_properties) {
    jsutils.extend(data.properties, opt_properties);
  }
  if (request.isDefined && domains.getRequestDomainRecord()) {
    jsutils.extend(data.properties, {'domainId': domains.getRequestDomainId() });
  }

	var stringified = fastJSON.stringify(data);
	var encoded = Base64.encodeBase64((new java.lang.String(stringified)).getBytes("UTF-8"));

  urlPostAsync(BASE_MIXPANEL_URL+"/track/", {data: "" + new java.lang.String(encoded)});
}







