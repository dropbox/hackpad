
$(function() {
  var originalHref = location.href;


  function _fixupPadTitleLinks() {
    var r = $.urlParam("start") || 0;
    $(".fpcontent:visible .title a").each(function(n, x) {
      $(x).attr("href", $(x).attr("href").split("#")[0] + "?r=" + r++);
    });
  }

  function _trackFacetClick() {
    $(".filter-profile, .filter-date, .filter-collection").click(function(ev) {
      trackEvent(this.className.split(" ")[0], null, $(this).text());
    });
  }


  if ($(document.body).hasClass("searchResultPage")) {
    _fixupPadTitleLinks();
    _trackFacetClick();
    originalHref = "/"; // go to home if this is a SRP
  }


  function _liveSearch(val, optFilterGroupId, optFilterAuthorId, optFilterLastEdit, optNoPushState) {
    createpadentry.addClass("ac_loading");
    $(".fpcontent:visible").fadeTo("fast", 0.5, function() {
      $(this).addClass("loading").css("opacity", "");
    });

    var data = { q: val };

    if (optFilterGroupId) {
      data.filterGroupId = optFilterGroupId; 
    }
    if (optFilterAuthorId) {
      data.filterAuthorId = optFilterAuthorId;
    }
    if (optFilterLastEdit) {
      data.filterLastEdit = optFilterLastEdit;
    }

    $.ajax({
      mode: "abort",
      port: "livesearch",
      url: "/ep/search/search_live",
      data: data,
      success: function(html) {
        createpadentry.removeClass("ac_loading");
        $('#view-switchers').hide();
        $(".fpcontent:visible").stop(true, true).removeClass("loading").css("opacity", "");

        if (createpadentry.val() == "") {
          return;
        }

        if (!optNoPushState && history.pushState) {
          history.pushState({ "search_live": val }, location.host.split(".")[0] + ": " + val,
            "/ep/search/?q=" + encodeURIComponent(val));
          trackPageview();
        }

        $(window).scrollTop(0);

        var $html = $("<div class='fpcontent new' />").html(html);
        $(".fpcontent.new").remove();
        $(".fpcontent").hide().after($html);

        // optNoPushState is true when _liveSearch is called as a result of forward/back
        // navigation, in these cases, we don't want to log this as a performed search
        if (!optNoPushState) {
          var numResults = parseInt($(".fpcontent:visible .num-search-results").text());
          if (isNaN(numResults)) {
            numResults = 0;
          }
          logSearchPerformed(val, numResults, "live");
        }

        _fixupPadTitleLinks();
        _trackFacetClick();

        if (etherpad.pro) {
          etherpad.pro.padlist.initStream();
          etherpad.pro.padlist.initDragDrop();
        }
      },
      error: function(x, err) {
        if (err != "abort") {
          // next request has already started, don't stop spinner
          createpadentry.removeClass("ac_loading");
          $(".fpcontent").removeClass("loading");
        }
      }
    });
    return false;
  }

  function _resetOriginal() {
    if ($(document.body).hasClass("searchResultPage")) {
      $(".fpcontent").addClass("loading");
      document.location = originalHref;
    } else {
      $(".fpcontent.new").remove();
      $(".fpcontent").show().removeClass("loading");

      if (history.pushState) {
        history.pushState({ }, location.host.split(".")[0], originalHref);
      }
    }
  }


  var createpadentry = $('#createpadentry');
  createpadentry.addClass("live");
  createpadentry.unbind();

  createpadentry.on('focus', function() {
    $('body').addClass('search-focused');
    createpadentry.parent().addClass('search-focused');
  });
  createpadentry.on('blur', function() {
    $('body').removeClass('search-focused');
    createpadentry.parent().removeClass('search-focused');
  });

  createpadentry.on("input", function(ev) {
    $('body').addClass('search-focused');
    var q = $(this).val();
    if ($.trim(q) == "") {
      logSearchPerformed("");
      _resetOriginal();
    } else {
      return _liveSearch(q);
    }
  });

  createpadentry.on("keypress", function(ev) {
    if (ev.keyCode == 13) {
      ev.preventDefault();
      return false;
    }
  });

  createpadentry.on("keyup", function(ev) {
    if (ev.keyCode == 27) {
      createpadentry.val("");
      _resetOriginal();
    }
  });

  // Mark the onload state with presearchState flag to be able to return to the feed via back
  if (window.history && window.history.replaceState) {
    history.replaceState({ presearchState: true, search_live: createpadentry.val()}, document.title, location.href);
  }


  $(".filter-group").live("click", function(ev) {
    return _liveSearch(createpadentry.val(), $(this).data("groupid"));
  });

  $(".filter-profile").live("click", function(ev) {
    return _liveSearch(createpadentry.val(), null, $(this).data("profileid"));
  });

  $(".filter-date").live("click", function(ev) {
    return _liveSearch(createpadentry.val(), null, null, $(this).data("date"));
  });


  // handle browser back/forward buttons
  window.onpopstate = function(ev) {
    if (ev.state && typeof(ev.state.search_live) != "undefined") {
      createpadentry.val(ev.state.search_live);
      if (ev.state.presearchState) {
        $(".fpcontent.new").remove();
        $(".fpcontent").show().removeClass("loading");
        return;
      }
      _liveSearch(ev.state.search_live, null /* optFilterGroupId */, null /* optFilterAuthorId */, null /* optFilterLastEdit */, true /* optNoPushState */);
    }
  };
});
