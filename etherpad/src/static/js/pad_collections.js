padcollections = (function() {
  var $collectionsDivEl;
  var $collectionsListEl;
  var $collectionsListOverflowEl;
  var $recentCollectionsEl;
  var initialized = false;

  function initEventHandlers() {
    // Expanding and collapsing collections
    $collectionsListEl.on("click", ".group-link", function(e) {
      return;
    });

    $collectionsDivEl.on("click", ".group-link .remove-group-btn", function(e) {
      _removePadFromCollection($(e.target));
      return false;
    });

    $('#add-to-collection').click(function() {
      $("#collection-picker").val('').focus();
      _addCollectionMode(true);
      trackEvent("collection.add_from_pad");
    });

    var isClickingCollection = false;
    $('#collection-picker').focus(function(e) {
      $('#collections-div').addClass('sticky');
    }).click(function(e) {
      $('#collections-div').addClass('sticky');
      return false;
    });
    $('#collection-picker').blur(function(e) {
      if (!isClickingCollection) {
        _addCollectionMode(false);
        $('#collections-div').removeClass('sticky');
      }
    });

    $('#collection-invite-list-item').on('click', function() { return false; });

    // When adding a pad to a collection from the list:
    // Bind to mousedown instead of click because the blur event
    // on the input box fires before click, but after mousedown.
    // Here we do a manual click detection by checking mouseup and
    // the target element because we want to mimic click behavior
    // but we also want to hide the the add collection UI if the
    // mousedown doesn't conclude in a click
    $recentCollectionsEl.on("mousedown", ".add-group", function(e) {
      isClickingCollection = true;
      var clickingEl = e.target;
      // Bind to window because mouseup could happen anywhere
      // Bind only for the next firing of the mouseup event
      $(window).one("mouseup", function(evt) {
        isClickingCollection = false;
        if (evt.target == clickingEl) {
          _addPadToCollection($(clickingEl));
          var extraInfo = {
            selectedIndex: $(clickingEl).index()
          };
          trackEvent("collection.add_from_list", "" /* logAction */, "" /* label */, extraInfo);
        } else {
          _addCollectionMode(false);
        }
      });
    });
  }

  function _showErrorMessage(msg) {
    alert(msg);
  }

  function _addPadToCollection($collectionEl) {
    var selectedCollection = $collectionEl;
    var groupId = selectedCollection.attr("groupId");
    var padId = pad.getPadId();

    $.ajax({
      type: 'post',
      url: '/ep/group/add-pad',
      data: {
        padId: pad.getPadId(),
        groupId: groupId
      },
      success: function(response) {
        if (response.success) {
          _addCollectionMode(false);
          selectedCollection.remove();
          if (!$recentCollectionsEl.find('.add-group').length) {
            $('#collections-recent-label').hide();
          }
        } else {
          _showErrorMessage(response.message);
        }
      }

    }).fail(function(jqXhr, textStatus) {
      _showErrorMessage("An error has occurred. We're looking into it.");
    });
  }

  function _removePadFromCollection($collectionEl) {
    var selectedCollection = $collectionEl.parents('.group-link');
    var groupId = selectedCollection.attr("groupId");
    var padId = pad.getPadId();

    $.ajax({
      type: 'post',
      url: '/ep/group/removepad',
      data: {
        padId: pad.getPadId(),
        groupId: groupId
      },
      success: function(response) {
        if (response.success) {
          selectedCollection.remove();
        } else {
          _showErrorMessage(response.error);
        }
      }

    }).fail(function(jqXhr, textStatus) {
      _showErrorMessage("An error has occurred. Please contact support if this error persists.");
    });
  }

  function _addCollectionMode(show) {
    return;

    if (show) {
      $("#add-to-collection").hide();
      $("#collection-picker-div").fadeIn(100);
      $('#collection-picker').focus();
    } else {
      $("#collection-picker-div").fadeOut(150, function() {
        $("#add-to-collection").show();
      });
    }
  }

  function _getPadCollectionsIds() {
    return clientVars.invitedGroupInfos
      .map(function(groupInfo) {
        return groupInfo.groupId;
      }).join(",");
  }

  function initCollectionPicker() {
    $("#collection-picker").invite({
      target: 'Pad',
      minChars: 0,
      createCollection: true,
      width: 263,
      inviteItemHandlers:
      {
        'hpgroup': {
          url:"/ep/group/add-pad",
          argsCallback: function(item) {
            return {padId: pad.getPadId(), groupId: item[2]};
          },
          onSuccess: function() {
            _addCollectionMode(false);
            trackEvent("collection.add_autocompleted");
          },
          onFailure: function(data) {
            _showErrorMessage(data.message);
          }
        },
        'newgroup': {
          url:"/ep/group/create-with-pad",
          argsCallback: function(item) {
            _addCollectionMode(false);
            return {padId: pad.getPadId(), groupName: item[1]};
          },
          onSuccess: function() {
            _addCollectionMode(false);
            trackEvent("collection.create_with_pad");
          },
          onFailure: function(resp) {
            _showErrorMessage(resp.error);
            trackEvent("collection.duplicate_alert");
          }
        }
      },
      dataURL: "/ep/invite/group_autocomplete",
      prompt: "Enter a collection name",
      noCache:true,
      extraParams: {
        excludeIds: _getPadCollectionsIds()
      }
    });
  }

  function toggleOverflow() {
    $collectionsListOverflowEl.toggle();
  }

  function prefetchCollections() {
    return;

    $.ajax({
      type:'get',
      url: '/ep/invite/recent-groups',
      data: {
        excludeIds: _getPadCollectionsIds()
      },
      success: function(response) {
        if (response.success) {
          var collectionsHtml = response.html.replace(/^\s+|\s+$/g, '');
          $('#collections-recent-list')
            .empty()
            .append(collectionsHtml);
          if ($(collectionsHtml).length) {
            $('#collections-recent-label').show();
          }
        }
      }
    });
  }

  var self = {
    init: function(opts) {
      if (initialized) {
        return;
      }
      var options = $.extend({
        $collectionsDivEl: $("#collections-div"),
        $collectionsListEl: $("#collection-list-div"),
        $collectionsListOverflowEl: $("#collection-list-overflow"),
        $recentCollectionsEl: $("#collections-recent-list-wrapper"),
      },opts);

      $collectionsDivEl = options.$collectionsDivEl;
      $collectionsListEl = options.$collectionsListEl;
      $collectionsListOverflowEl = options.$collectionsListOverflowEl;
      $recentCollectionsEl = options.$recentCollectionsEl;

      initEventHandlers();
      initCollectionPicker();
      prefetchCollections();
      initialized = true;
    },
    renderPadCollections: function() {
      $collectionsDivEl.find("div.group-link").remove();
      for (var i = 0; i < clientVars.invitedGroupInfos.length; i++) {
        var groupInfo = clientVars.invitedGroupInfos[i];
        var d = $("<div/>")
          .addClass("group-link")
          .attr("groupId", groupInfo.groupId);
        var a = $("<a/>")
          .attr("href", "/ep/group/" + groupInfo.groupId)
          .attr('title', groupInfo.name)
          .append(groupInfo.name)
          .appendTo(d);
        var x = $("<div/>")
          .addClass("remove-group-btn")
          .attr('title', 'Remove this pad from this collection.')
          .append($('<i class="icon-x">'))
          .appendTo(d);

        if (i == 2) {
          $collectionsListEl.append(
              $('<div>').addClass('group-link').addClass('group-link-overflow').
                  append($('<a>').on('click', toggleOverflow).text('...')));
        }

        if (i > 1) {
          $collectionsListOverflowEl.append(d);
        } else {
          $collectionsListEl.append(d);
        }
      }

      $('#add-to-collection').toggleClass('no-collections', clientVars.invitedGroupInfos.length == 0);

      buttonCloseMenu($('#add-to-collection'));
    },
    loadCandidateCollections: prefetchCollections
  };
	return self;
})();
