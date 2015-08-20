

var padtopbar = (function() {
  $(function() {
    var createpadlink = $('#createpadlink');
    var createpadentry = $('#createpadentry');

    if (createpadentry.autocomplete && !createpadentry.hasClass("live")) {
      // focus the createpadentry except on iphone - on iphone it's both impossible
      // and breaks placeholder text rendering
      var isIphone = navigator.userAgent.toLowerCase().indexOf('iphone') != -1;
      if (window.location.pathname == '/' && !isIphone ) {
        createpadentry.focus();
      }

      function preparseSearchPage(numFound) {
        var val = padutils.escapeHtml(createpadentry.val());
        return [{
          data: ["<span class='ac-results-see-all-prepended'>" + (numFound ? Math.min(numFound, 4) + " of " + numFound : "See all") + " results</span>",
                 "ep/search/?q=" + encodeURIComponent(val)],
          value: val,
          result: val
        }];
      }
      function preparse(hideSearchPage, numFound) {
        var val = padutils.escapeHtml(createpadentry.val());
        var rows = [];
        if (val) {
          if (!hideSearchPage) {
            rows = rows.concat(preparseSearchPage());
          }

          rows.push({
            data: ["<span class='ac-results-see-all ac-results-extra'>See all " + (numFound ? numFound : "") + " results <i class='icon-forward'></i></span>",
                   "ep/search/?q=" + encodeURIComponent(val)],
            value: val,
            result: val
          });
        }
        return rows;
      }
      var MAX_SEARCH_RESULTS = 4;
      function parse(response) {
        trackPageview('/virtual/search-results?q='+createpadentry.val());

        var data = "";
        var numFound = 0;
        if (response.success) {
          data = response.data;
          numFound = response.numFound;
        } else {
          modals.showHTMLModal(response.html);
          $("input").blur();
          return [];
        }

        var parsed = [];

        // search page entry first
        parsed = parsed.concat(preparseSearchPage(response.numFound));

        var rows = data.split("\n");
        for (var i=0; i < rows.length && i < MAX_SEARCH_RESULTS; i++) {
          var row = $.trim(rows[i]);
          if (row) {
            row = row.split("|");
            parsed.push({
              data: row,
              value: row[0],
              result: row[0]
            });
          }
        }
        logSearchPerformed(createpadentry.val(), numFound, "From pad");

        // autocompleter parse + insert create entry last
        parsed = parsed.concat(preparse(true, response.numFound));

        return parsed;
      }
      function formatItem(row) {
        return '<div class="ac-search-result">' +
            (row[2] ? row[0]+'<div class="snippet">'+row[2]+'</div>' : row[0]) +
            '</div>';
      }
      var width = createpadentry.length ? Math.max($(window).width() - 2 * createpadentry.offset().left - 27, createpadentry.width() + 27) : 0;
      createpadentry.autocomplete("/ep/search/autocomplete", {
        max: MAX_SEARCH_RESULTS + 4,
        scroll: false,
        parse: parse,
        preparse: preparse,
        alwaysPreparse: true,
        delay: 0,
        noCache:true,
        selectFirst: true,
        minCountForSelect: 2,
        width: width + "px",
        formatItem: formatItem
      }).result(function(event, item, _ignored, position, opt_event) {
          // position-1 to accounts for SRP as first result
          if (item[1].indexOf("ep/pad/newpad") != -1) {
            window.open("/" + item[1] + "&r=" + (position - 1), '_blank');
          } else {
            var url;
            if (item[1].indexOf("?") == -1) {
              url = "/" + item[1] + "?r=" + (position - 1);
            } else {
              url = "/" + item[1] + "&r=" + (position - 1);
            }

            if (opt_event && (opt_event.metaKey || opt_event.ctrlKey)) {
              window.open(url, '_blank');
              createpadentry.val('');
            } else {
              location.href = url;
            }
          }
      });

      /*
      .enter(function(){
        document.location.href = "/ep/search/?q=" + $(createpadentry).val();
      });
      */
      createpadentry.on('input', function() {
        if ($.trim(createpadentry.val()) == '') {
          logSearchPerformed('');
        }
      })

      if (createpadentry.val()) {
        createpadentry.trigger(($.browser.opera ? "keypress" : "keydown") + ".autocomplete");
      }
    }

    createpadentry.on('focus', function() {
      createpadentry.parent().addClass('search-focused');
    });
    createpadentry.on('blur', function() {
      createpadentry.parent().removeClass('search-focused');
    });
  });


  $(document).ready(function(){
    $('.banner-close').on('click', function() {
      $('body').removeClass($(this).parent().attr('id'));
      $(this).remove();
    });

    $('#guest-banner-msg a').on('click', function() {
      modals.showModal('#page-login-box', 0);
      return false;
    });

    var oneWeek = new Date();
    var oneMonth = new Date();
    oneWeek.setTime(oneWeek.valueOf() + 7 * 24 * 60 * 60 * 1000);
    oneMonth.setTime(oneMonth.valueOf() + 30 * 24 * 60 * 60 * 1000);

    if (!padutils.getIsMobile()) {
      padutils.tooltip("body > header [data-tooltip], #toolbar [data-tooltip], #site-toggle");
    }

    trackLinks('#createpadlink', 'toolbarClick', {command: 'newpad'});

     // coupled with globals.less
    var bannerHeightFull = 176;
    if ($('body').hasClass('hasBanner')) {
      var $window = $(window);
      var $banner = $('#site-banner');
      var padbarHeight = $('#padbar').outerHeight();
      $window.scroll(throttle(function(evt) {
        var pos = $window.scrollTop();
        var posRatio = pos /  (bannerHeightFull - padbarHeight);
        if (posRatio < 1) {
          $banner.css({
            height: bannerHeightFull-pos,
            opacity: 1
          });
        } else {
          $banner.css({
            height: padbarHeight,
            opacity: Math.max(0, 2 - posRatio)
          });
        }
      }, 33 / 2));
      if ($('body').hasClass('propad')) {
        setTimeout(function() {
          $(document).scrollTop(bannerHeightFull/2);
        }, 0);
      }
    }
  });

  var self = {
  };
  return self;
}());

