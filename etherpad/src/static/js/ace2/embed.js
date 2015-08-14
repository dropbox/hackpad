
embed = {};

/**
 * Listens for resizes on the twitter embed since the height can be dynamic.
 * @param {Element} tweetOuter The iframe containing the tweet.
 */
embed.resizeTwitterEmbed = function(tweetOuter) {
  var rendered = false;
  var tweetOuterInterval = window.setInterval(function() {
    var tweetInner = $(tweetOuter.contentDocument).find("iframe");
    if (tweetInner.hasClass("twitter-tweet-rendered") && tweetInner.height()) {
      window.clearInterval(tweetOuterInterval);
      setTimeout(function() {
        $(tweetOuter).height($(tweetOuter.contentDocument).height());

        if (window['onEmbedResize']) {
          window['onEmbedResize'](tweetOuter);
        }
      }, 1000);
    }
  }, 1000);
};

/**
 * Listens for resizes on the general oembeds since the height can be dynamic.
 * @param {Element} embedOuter The iframe containing the embed.
 */
embed.resizeOembedScript = function(embedOuter) {
  var rendered = false;
  var embedOuterInterval = window.setInterval(function() {
    var embedInner;
    embedInner = $(embedOuter.contentDocument).find("body > .gist");
    if (!embedInner.length) {
      embedInner = $(embedOuter.contentDocument).find("body");
    }
    if (embedInner.height()) {
      window.clearInterval(embedOuterInterval);
      $(embedOuter).height(embedInner.height() + 25);

      if (window['onEmbedResize']) {
        window['onEmbedResize'](embedOuter);
      }
    }
  }, 1000);
};

/**
 * Fetches embed html from the server and passes it along to the callback.
 * @param {string} url .
 * @param {Function} callback .
 */
embed.onEmbed = function(url, callback) {
  var maxWidth = 580;
  if (padutils.getIsMobile()) {
    maxWidth = Math.min(maxWidth, $(window).width() - 65);
  }

  $.get("/ep/api/embed", { 'url': url, 'maxwidth': maxWidth }, function(data) {
    if (!data) {
      callback();
    } else if (data['html']) {
      // CrunchBase and Amazon html previews are big and ugly
      if ((data['provider_name'] == "CrunchBase" ||
          data['provider_name'] == "Amazon") && data['thumbnail_url']) {
        callback('<img class="inline-img" src="' +
            data['thumbnail_url'] + '">');
        return;
      }

      var obj = $('<div/>').append(data['html']);

      if (!padutils.getIsMobile()) {
        obj = obj.append('<div class="remove-media"></div>');
      }

      // wmode transparency fixups
      obj.find("object").append('<param name="wmode" value="opaque"/>');
      obj.find("embed").attr('wmode', 'opaque');

      callback(obj.html());
    } else if (data['type'] == 'photo' && data['url']) {
      callback('<img class="inline-img" src="' + data['url'] + '">' +
          '<div class="remove-media"></div>');
    } else if (data['type'] == 'link' && data['thumbnail_url']) {
      callback('<img class="inline-img" src="' + data['thumbnail_url'] + '">' +
          '<div class="remove-media"></div>');
    } else {
      callback();
    }
  }).error(function() { callback(); });
};
