
/* Shard all the things! */

if (typeof(clientVars) != "undefined" && clientVars.padId) {
  jQuery.ajaxPrefilter(function(options, originalOptions, jqXHR) {
    if (options.url.indexOf("hackpad.com") > -1) {
      options.url += options.url.indexOf("?") > -1 ? "&tag="+clientVars.padId : "?tag="+clientVars.padId;
    }
  });
}
