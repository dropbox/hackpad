

(function($){

  window.hackpad = function(){
    function render_url(targetElement, url) {
      var a = document.createElement('a');
      a.href = url;
      var origin = a.protocol + '//' + a.host;
      var params = a.search.substring(1).split('&');
      var padId = '';
      for (var i = 0; i < params.length; i++) {
        var keyval = params[i].split('=');
        if (keyval[0] == 'padId') {
          padId = keyval[1];
          break;
        }
      }
      var frameId = "hackpad-" + padId; // note that this is by definition uri-encoded
      // TODO: post instead of get into the iframe
      $("<iframe id='"+frameId+"' style='border:0px; width:100%; height:100%; min-height: 420px;'></iframe>").attr('src', url).appendTo(targetElement);
      window.addEventListener("message", function(event) {
        if (event.origin == origin) {
          var args = event.data.split(":");

          // 3rd party cookies workaround
          if (args[0] == "hackpad" && args[1] == "getcookie") {
            // go to hackpad.com to establish a cookie, then come back here
            var contURL = decodeURIComponent(args[2]);
            document.location = contURL + "&contUrl=" + encodeURIComponent(document.location);
          }

          // height adjustment
          if (args.length == 3 && args[0] == frameId && args[1] == "height") {
            var height = Number(args[2]) + 60; // 60 is non-ace elements offset
            var hp = document.getElementById(frameId).parentElement;

            if (hp && height > 420) {
              hp.style.height = height + "px";
            }
          }
        }
      }, false);
    }

    function render(targetElement, padId, optSubDomain) {
      var subDomain = optSubDomain && optSubDomain.length ? (optSubDomain + ".") : "";
      var url = "<%= (appjet.config.useHttpsUrls ? 'https://' : 'http://')%>" + subDomain + "<%=appjet.config['etherpad.canonicalDomain'] %>/ep/api/embed-pad";

      render_url(targetElement, url + "?padId=" + encodeURIComponent(padId))
    }

    return {
      render: render,
      render_url: render_url
    };

  }();
})(jQuery);
