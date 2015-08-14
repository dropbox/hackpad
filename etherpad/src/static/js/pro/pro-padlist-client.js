/*!
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

if (!window.etherpad) {
  etherpad = {};
}
if (!window.etherpad.pro) {
  etherpad.pro = {};
}

etherpad.pro.padlist = {};

etherpad.pro.padlist.initDragDrop = function() {
  if (padutils.getIsMobile()) {
    return;
  }

  var helperEl;
  /*$("tr.nav-item ").draggable({
    revert: "invalid",
    handle: ".dragdots",
    helper: function( event ) {
      if (!helperEl) {
        var row = $(event.target).parents("tr").last();
        var padId = row.data('padid');
        var title = row.find(".title-link").text();
        helperEl =  $('<div class="drag-pad-widget"><img src="/static/img/dragdots.png" class="dragdots">'+padutils.escapeHtml(title)+'</div>');
      }
      return helperEl;
    },
    zIndex: 1000,
    stop: function() {
      var overflowButton = $('.domain-item-overflow .hp-ui-button');
      if (overflowButton.hasClass('hp-ui-button-active')) {
        overflowButton.click();
      }
      helperEl = null;
    }
  });*/

  $(".streamtable:not(.ui-sortable) .segment-outer-wrapper").draggable({
    handle: ".drag-handle, .icon-grippy",
    distance: 10,
    revert: "invalid",
    helper: "clone",
    zIndex: 1000,
    stop: function() {
      var overflowButton = $('.domain-item-overflow .hp-ui-button');
      if (overflowButton.hasClass('hp-ui-button-active')) {
        overflowButton.click();
      }
    },
    start: function(event, ui) {
      var draggingInEl = $(ui.helper);
      var sourceEl = $(ui.helper.context);
      if (draggingInEl.length){
        draggingInEl.css({
          height: sourceEl.outerHeight(),
          width: sourceEl.outerWidth(),
        });
        draggingInEl.find('.segment-last-edited-date').css('visibility', 'hidden');
      }
    }
  });

  /*$(".group-item").droppable({
      activeClass: 'drop-active',
      hoverClass: "drop-hover",
      tolerance: "pointer",
      accept: ".segment-outer-wrapper[data-subdomain=''], tr.nav-item",
      tolerance: "pointer",
      drop: function( event, ui ) {
        $(this).effect("pulsate",{times:2}, 1000);

        var groupId = $(event.target).data('groupid');
        if (!groupId) {
          groupId = $(event.target).parents('div').first().data('groupid');
        }

        var padId = $(ui.draggable).data('padid');
        $.post('/ep/group/add-pad', {padId:padId, groupId: groupId, success:_onAddedToGroup()});

        function _onAddedToGroup() {
          $.ajax({type:'post',
                  url: '/ep/ajax-list?section='+clientVars.selectedSection+'&show='+20,
            success: function(data) {
              $("#padtablecontainer").replaceWith(data.html);
              etherpad.pro.padlist.initPinDragDrop();
              etherpad.pro.padlist.initStream();
              etherpad.pro.padlist.initDragDrop();
            },
          });
        }
      }
  });

  $(".group-item").draggable({
    cursorAt: { top: 6, left: -16 },
    distance: 10,
    revert: "invalid",
    helper: function( event ) {
      var name = $(event.target).text();
      return $("<div class='drag-pad-widget'>"+name+"</div>" );
    },
    stop: function() {
      var overflowButton = $('.domain-item-overflow .hp-ui-button');
      if (overflowButton.hasClass('hp-ui-button-active')) {
        overflowButton.click();
      }
    }
  });*/
}

etherpad.pro.padlist.initDomainDragDrop = function() {
  if (padutils.getIsMobile()) {
    return;
  }

  $(".domain-item:not(.domain-item-new), [data-domainid]").droppable({
    activeClass: 'drop-active',
    hoverClass: "drop-hover",
    tolerance: "pointer",
    accept: ".segment-outer-wrapper[data-subdomain=''], tr.nav-item, .group-item",
    tolerance: "pointer",
    over: function(event, ui) {
      if ($(event.target).hasClass('domain-item-overflow')) {
        var overflowButton = $(event.target).find('.hp-ui-button');
        if (!overflowButton.hasClass('hp-ui-button-active')) {
          overflowButton.click();
        }
      }
    },
    drop: function(event, ui) {
        if ($(event.target).hasClass('domain-item-overflow')) {
          return;
        }

        $(this).effect("pulsate",{times:2}, 1000);

        var domainId = $(event.target).data('domainid');
        if (!domainId) {
          domainId = $(event.target).parents('div').first().data('domainid');
        }

        function verifyMove(data, actionOnAccept, hideOnSuccess) {
          if (data.success) {
            hideOnSuccess.hide();
          } else if (data.verify) {
            var dlg = $("#migrate_group");
            dlg.find('form').attr('action', actionOnAccept).unbind("submit").submit(function() {
              hideOnSuccess.hide();
            });
            dlg.find('[name=domainId]').val(data.domainId);
            dlg.find('[name=padId]').val(data.padId);
            var numberOfPads = data.numPads + ' ' + (data.numPads == 1 ? 'pad' : 'pads');
            dlg.find('#migrateFromName').text(numberOfPads);
            dlg.find('#migratePadsCount').text(numberOfPads);
            dlg.find('#migrateToName').text(data.orgName);
            dlg.find('#migrateToHost').text(data.domainName);

            var numUsersOver3 = data.users.slice(3).length;
            var shortUserText = data.users.slice(0, 3).join(', ') + (numUsersOver3 ? ', and ' + numUsersOver3 + ' more' : '');
            var longUserText = data.users.join(', ');

            dlg.find('#migrateUsers').text(shortUserText).unbind('click').click(function() {
              $(this).text($(this).text() == shortUserText ? longUserText : shortUserText);
            });

            modals.showModal("#migrate_group");
          } else if (data.error) {
            alert(data.error);
          }
        }

        var groupId = $(ui.draggable).data('groupid');
        if (groupId) {
          $.post('/ep/group/' + groupId +'/migrate-to/' + domainId, function(data) {
            verifyMove(data, '/ep/group/' + groupId +'/migrate-to/' + domainId, $(ui.draggable));
          }).error(function(xhr) {
            alert("Error Migrating Collection: " + xhr.responseText);
          });
          return;
        }

        var padId = $(ui.draggable).data('padid');
        if (padId) {
          $.post('/ep/pad/migrate-to', {domainId: domainId, padId: padId}, function(data) {
            var segment = $(ui.draggable);
            verifyMove(data, '/ep/pad/migrate-to', segment.length ? segment : $(ui.draggable));
          }).error(function(xhr) {
            alert("Error Migrating Pad: " + xhr.responseText);
          });
          return;
        }
    }
  });
}

etherpad.pro.padlist.getPinnedContainerSelector = function() {
  var selector = "#pinnedpadscontainer";
  if (clientVars.selectedSection != "stream") {
    selector += " tbody";
  }
  return selector;
}

etherpad.pro.padlist.getUnpinnedPadSelector = function(padId) {
  var padIdVal = padId ? "=" + padId : '';
  var selector = "#listwrap .segment-outer-wrapper[data-padid"+padIdVal+"]";
  if (clientVars.selectedSection != "stream") {
    selector = "#listwrap tr[data-padid"+padIdVal+"]";
  }
  return selector;
}

etherpad.pro.padlist.initPinDragDrop = function() {
  if (padutils.getIsMobile()) {
    return;
  }

  // Enable only for collections pages, for now
  if (clientVars.canPin && $("body.collection-page").length) {

    var selector = etherpad.pro.padlist.getPinnedContainerSelector();
    var $pinnedContainer = $(selector);
    var isOut = false;

    $("#listwrap .segment-outer-wrapper").draggable({
      connectToSortable: "#pinnedpadscontainer",
      distance: 10,
      helper: "clone",
      handle: ".drag-handle, .icon-grippy",
      zIndex: 1000,
      start: function (event, ui) {
        // Set the width explicitly from the original source object
        ui.helper.width(ui.helper.prevObject.width());
        if ($pinnedContainer.hasClass("empty")) {
          $('#pinnedpadsseparator').show();
          $pinnedContainer.slideDown(200, function() {
            // force the empty container to recalculate its size once it appears
            $pinnedContainer.sortable("refreshPositions");
          });
        }
      },
      stop: function (event, ui) {
        if ($pinnedContainer.hasClass("empty") && !$("#listwrap-pinned").hasClass('always-show-tip')) {
          $pinnedContainer.slideUp(200, function() {
            $('#pinnedpadsseparator').hide();
          });
        }
      }
    });

    if ($pinnedContainer.hasClass('ui-sortable')) {
      return;
    }

    $pinnedContainer.sortable({
      cursor: "move",
      revert: false,
      placeholder: "sortable-placeholder",
      // forcePlaceholderSize: true,
      tolerance: "pointer",
      handle: ".drag-handle, .icon-grippy",
      receive: function(event, ui) {
        $pinnedContainer.removeClass("empty droppable");
        ui.item.removeClass("ui-draggable");
      },
      update: function(event, ui) {
        if (!isOut) {
          var afterPadId = ui.item.prev().data('padid');
          var beforePadId = ui.item.next().data('padid');
          var localPadId = ui.item.data('padid');
          var unpinEl = $(etherpad.pro.padlist.getUnpinnedPadSelector(localPadId));
          etherpad.pro.padlist.changePinnedPadPosition(localPadId, afterPadId, beforePadId, unpinEl);
          trackEvent("collection.pinned_reorder", "" /* action */ , "" /* label */, { padId: localPadId, toIndex: ui.item.index() });
        }
      },
      start: function(event, ui) {
        var localPadId = ui.item.data('padid');
       // Explicitly set the placeholder height
        $('.sortable-placeholder').height(ui.item.innerHeight());
        trackEvent("collection.pinned_drag_start", "" /* action */ , "" /* label */, { padId: localPadId, fromIndex: ui.item.index() });
        var draggingInEl = $('.segment-outer-wrapper.ui-draggable-dragging');
        if (draggingInEl.length){
          draggingInEl.addClass("pinning").css('height', '');
          $('#pinnedpadscontainer.empty').addClass('droppable');
        }
      },
      out: function(event, ui) {
        var draggingInEl = $('.segment-outer-wrapper.ui-draggable-dragging.pinning');
        if (draggingInEl.length){
          draggingInEl.removeClass("pinning");
          $('#pinnedpadscontainer.empty.droppable').removeClass('droppable');
        }
      },
      sort: function(event, ui) {
        var containerHeight = ui.item.parent().outerHeight();
        var yPos = ui.position.top;
        if (yPos > containerHeight + 100) {
          // The isOut variable persists longer than the unpinning class
          // because it is not unset in beforeStop. This allows the update handler
          // to see the correct state, which fires after beforeStop when unpinning.
          isOut = true;
          ui.item.addClass("unpinning");
        } else {
          isOut = false;
          ui.item.removeClass("unpinning");
        }
      },
      beforeStop: function(event, ui) {
        if (isOut) {
          var localPadId = ui.item.data('padid');
          etherpad.pro.padlist.pinPadInCollection(localPadId, false /* pin */, true /* optInstantUnpin */);
          trackEvent("collection.unpin_pad", "" /* action */ , "" /* label */, { padId: localPadId, via: "dragOut" });
          ui.item.removeClass("unpinning");
        }
      },
    });
  }
}

etherpad.pro.padlist.initStream = function() {
  // remove title line if allAdd
  $(".ace-line:first-child").filter(".allAdd").each(function(i, l) {
    var title = $(this).parents(".segment-wrapper").find(".title-link").text();
    if ($(this).find("span").text() == title) { $(this).remove(); }
  });

  $("img.inline-img").parents(".ace-line").css("clear", "both")
    .next(".longKeep").hide();

  var overflowCushion = $('body').hasClass('collection-page') ? 22 : 100;

  // initial overflow check (just text size)
  $(".segment-content").each(function(i, el) {
    if ($(el).hasOverflow(overflowCushion)) {
      $(el).parents(".segment").addClass("expandable");
    }
  });

  $(".ace-line :not(.internal) a").attr("target", "_blank");

  $(".ace-line a.embed").each(function(index, el) {
    embed.onEmbed(el.href, function(html) {
      if (!html) { return; }

      var segmentContent = $(el).parents(".segment-content");
      $(html).replaceAll($(el)).find("img").addClass("inline-img");

      // second overflow check (cached images loaded)
      if (segmentContent.hasOverflow(overflowCushion)) {
        segmentContent.parents(".segment").addClass("expandable");
      }

      // 3rd overflow check (fetched images loaded)
      setTimeout(function() {
        if (segmentContent.hasOverflow(overflowCushion)) {
          segmentContent.parents(".segment").addClass("expandable");
        }
      }, 2000);
    });
  });

  var pinnedPadSelectors = [];

  var selector = etherpad.pro.padlist.getPinnedContainerSelector();
  $(selector).children().each(function(index, el) {
    var padId = $(el).data('padid');
    if (padId) {
      var padIdSelector = etherpad.pro.padlist.getUnpinnedPadSelector(padId);
      pinnedPadSelectors.push(padIdSelector);
    }
  });

  $(pinnedPadSelectors.join(",")).hide();

}

String.prototype.hashCode = function(){
    var hash = 0, i, chr;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        chr = this.charCodeAt(i);
        hash = ((hash<<5)-hash)+chr;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

etherpad.pro.padlist.initStreamOnce = function() {
  $("img.inline-img").live("click", function() {
      var container = $("<div>").addClass("lightbox-container");
      $("body").append(container);
      var x = $('<button class="hp-ui-button dialog-cancel-x" data-click="hidemodal"><span class="hp-ui-button-content icon-x"></span></button>');
      var inner = $("<div>").addClass('lightbox-inner').addClass('center-content').append($("<img>").attr('src', $(this).attr("src"))).append(x);
      var outer = $("<div>").addClass('center-wrap').append(inner);
      container.append(outer);
      container.css('z-index', 1000).click(function(){$(this).remove()});
      return false;
  });

  $('.segmentSeeWhole, .segmentSeeLess').live("click", function() {
    $(this).parents(".segment").toggleClass("selected");
    return false;
  });

  $.fn.hasOverflow = function() {
    return $(this)[0].getBoundingClientRect().bottom >
        $(this).parents('.segment')[0].getBoundingClientRect().bottom;
  };

  var _inSegmentControlClick = false;
  $('.segment-controls').live('click', function(e) {
    // prevent re-entry
    if (!_inSegmentControlClick) {
      _inSegmentControlClick = true;
      $(this).find("a").first().click();
      _inSegmentControlClick = false;
    }
  });

  $(".ace-line").live("click", function(ev) {
    if ($(ev.target).is("a, img")) {
      return;
    }

    var padId = $(this).parents(".segment-outer-wrapper").data("padid");
    var title = clientVars.padTitles[padId];
    if (title) {
      var urlTitle = title.replace(' ', '-', "g");
    } else {
      urlTitle = "";
    }

    // need to skip to next line if the text is ""
    var lineText = $.trim($(this).text());

    // Normalize spaces, this was causing a difference in computed
    // hashes for goToLine in ace
    lineText = lineText.replace(/\u00a0/g, " ");
    var lineHash = lineText.hashCode();

    // Fetch pad link address from title link, could be cross domain
    var href = $(this).parents('.segment').find("div.title > a").attr('href') || ("/" + padId + "#" + urlTitle);
    location.href = "/" + padId + "#" + urlTitle + ":" + lineHash;
  });

}

$(document).ready(function() {

  // Work around extremely annoying webkit bug
  $("#padtable:not(.streamtable) tr").live("mouseover", function() {
    $("#padtable tr.selected").removeClass("selected");
    $(this).addClass("selected");
  });
  $("table#padtable:not(.streamtable)").live("mouseout", function(e) {
    if (!$(e.relatedTarget).parents("table").length && (e.relatedTarget && e.relatedTarget.id != "padtable")) {
      $("#padtable tr.selected").removeClass("selected");
    }
  });

  $('#listwrap-pinned').on('hover', '#pinnedpadtable tr', function(e){
    if (e.type == "mouseenter") {
      $(this).addClass("selected");
    } else if (e.type == "mouseleave") {
      $(this).removeClass("selected");
    }
  });

  function getTargetPadId(target) {
    var localPadId = $(target).attr('id').split('-')[2];
    //console.log("localPadId = "+localPadId);
    return localPadId;
  }

  function isPadInPinnedSection(item) {
    return $(item).parents('#listwrap-pinned').length;
  }

  function isPadPinned(padId) {
    return $("#listwrap-pinned tr[data-padid="+padId+"], #listwrap-pinned .segment-outer-wrapper[data-padid="+padId+"]").length;
  }

  var padActionFollow =
    {"Follow": {
          onclick: function(menuItem, menu) {
            var localPadId = getTargetPadId(menu);
          },
          icon: 'icon-follow'
        }
    };

  var padActionUnFollow =
    {"Unfollow": {
          onclick: function(menuItem, menu) {
            var localPadId = getTargetPadId(menu);
            etherpad.pro.padlist.toggleFollowPad(localPadId, menu);
          },
          icon: 'icon-follow'
        }
    };

  var padActionRemoveFromCollection =
    {"Remove from Collection": {
      onclick: function(menuItem, menu) {
        var localPadId = getTargetPadId(menu);
        etherpad.pro.padlist.removeFromCollection(localPadId, menu);
      },
      icon: 'icon-delete'
    }
  };

  var padActionDelete =
    {"Delete...": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          etherpad.pro.padlist.deletePad(localPadId, menu);
        },
        icon: 'icon-delete'
        /*icon: '/static/img/pro/padlist/trash-icon.gif'*/
      }
    };

  var padActionPinInSite =
    {"Pin to Top": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var pin = true;
          etherpad.pro.padlist.pinPadInSite(localPadId, menu, pin);
        },
        icon: 'icon-pin'
      }
    };

  var padActionPinInCollection =
    {"Pin to Top": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var pin = true;
          etherpad.pro.padlist.pinPadInCollection(localPadId, pin);
          trackEvent("collection.pin_pad", "" /* action */ , "" /* label */, { padId: localPadId, via: "menu" });
        },
        icon: 'icon-pin'
      }
    };

  var padActionUnpinInSite =
    {"Unpin": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var pin = false;
          etherpad.pro.padlist.pinPadInSite(localPadId, menu, pin);
        },
        icon: 'icon-pin'
      }
    };

  var padActionUnpinInCollection =
    {"Unpin": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var pin = false;
          etherpad.pro.padlist.pinPadInCollection(localPadId, pin);
          trackEvent("collection.unpin_pad", "" /* action */ , "" /* label */, { padId: localPadId, via: "menu"});
        },
        icon: 'icon-pin'
      }
    };

  var padActionHideFromPublic =
    {"Hide": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var subdomain = $(menu).parents('.segment-outer-wrapper').data('subdomain');
          etherpad.pro.padlist.hidePadFromPublic(subdomain, localPadId, true /* hide */);
        }
      }
    };

  var padActionUnhideFromPublic =
    {"Unhide": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu);
          var subdomain = $(menu).parents('.segment-outer-wrapper').data('subdomain');
          etherpad.pro.padlist.hidePadFromPublic(subdomain, localPadId, false /* hide */);
        }
      }
    };

  if (clientVars.showingArchivedPads) {
    padActionsMenu[2]["Un-archive"] = padActionsMenu[2]["Archive"];
    delete padActionsMenu[2]["Archive"];
  }

  $(document).on('click', '.gear-drop', function(event) {
    var menu = $('#hp-pad-actions');
    var targetEl = event.target;

    var localPadId = getTargetPadId(targetEl);
    var actions = [];

    // Reset disabled state
    padActionDelete["Delete..."].disabled = false;

    if (clientVars.canPin){
      if (clientVars.groupId){
        var pinAction;
        if (isPadInPinnedSection(targetEl)) {
           pinAction = padActionUnpinInCollection;
        } else {
          var $padEl = $(targetEl).parents('tr,.segment-outer-wrapper');
          var padId = $padEl.attr('data-padid') || $padEl.attr('padid');
          if (!isPadPinned(padId)){
            pinAction = padActionPinInCollection;
          }
        }
        if (pinAction) {
          actions.push(pinAction);
        }
      } else {
        var pinAction = isPadInPinnedSection(targetEl) ? padActionUnpinInSite :
            padActionPinInSite;
        actions.push(pinAction);
      }
    }

    if (clientVars.groupId && !clientVars.userIsGuest) {
      actions.push(padActionRemoveFromCollection);
    }
    if (clientVars.canUnFollow) {
      actions.push(padActionUnFollow);
    }

    actions.push(padActionDelete);
    if (!clientVars.canDelete[localPadId]) {
      padActionDelete["Delete..."].disabled = true;
    }

    if (clientVars.canHide) {
      actions.push(padActionHideFromPublic);
    }

    if (clientVars.canUnhide) {
      actions.push(padActionUnhideFromPublic);
    }

    var ulEl = menu.find('.hp-ui-button-list-ul');
    ulEl.empty();

    function menuAction(action) {
      return function() {
        if ($(this).hasClass('hp-ui-button-menu-disabled')) {
          return false;
        }
        action.onclick(menu, targetEl);
        menu.data('close')(menu);
        menu.hide();
        return false;
      };
    }

    for (var x = 0; x < actions.length; ++x) {
      var key = $.map(actions[x], function(element, index) {return index})[0];
      var anchorEl = $('<a>').
          attr('src', '#').
          toggleClass('hp-ui-button-menu-disabled', actions[x][key].disabled == true).
          on('click', menuAction(actions[x][key]));
      if (actions[x][key].icon) {
        anchorEl.append($('<i>').addClass(actions[x][key].icon));
      }
      anchorEl.append($('<span>').text(key));
      ulEl.append($('<li>').append(anchorEl));
    }

    var isListView = $('table#padtable').length;
    menu.show().offset({
        'left': $(targetEl).offset().left + (isListView ? 0 : 10),
        'top': $(targetEl).offset().top + 6}).
        click();

    return false;
  });

  // init stream
  etherpad.pro.padlist.initStreamOnce();
  etherpad.pro.padlist.initStream();

  $('.segment-outer-wrapper').live('click', function(event) {
    var segmentWrapper = $(event.target).parents('.segment-wrapper');
    if (segmentWrapper.length == 0 ||
        $(event.target).parents('.segment-controls').length != 0 ||
        $(event.target).parents('.title, .segment-content').length == 0 ||
        $(event.target).hasClass('ace-line-author') ||
        event.ctrlKey || event.metaKey ||
        $(event.target).is('a, img') ||
        padutils.getIsMobile()) {
      return;
    }

    var padid = $(this).attr('data-padid');

    if ($('body').hasClass('hasBanner')) {
      $(window).scrollTop($('#site-banner').outerHeight(true));
    }

    $('.segment-outer-wrapper:not([data-padid=' + padid + ']), ' +
        '.segment-pic, #homeright, .drag-handle, .icon-grippy, .segment-info, ' +
        '#homeleft > h1, #homeleft > h2, .segment-last-edited-date, .gear-drop').
        css('opacity', 0);
    $('#pad-picker-div, #new-collection-pad-btn, #groupaccess').hide();

    $('#sitebar').show();
    var marginDiff = $(this).offset().top -
        ($(window).scrollTop() + $('body > header').height() +
            ($('body').hasClass('hasBanner') ? -1 * $('#site-banner').outerHeight(true) : 0) +
            -1 * $(this).find('.segment-last-edited-date').outerHeight(true));
    $(this).find('.segment').css('transition', 'all 100ms ease-out');
    segmentWrapper.css('transition', 'all 100ms ease-out');
    $('body').css('height', $('body').height() + $(window).height());
    segmentWrapper.css({
      'max-height': 'none',
      'height': $(window).height(),
    });
    $(this).find('.segment').css({
      'max-height': 'none',
      'margin-top': marginDiff < 0 ? -1 * marginDiff + 29 : -1 * marginDiff
    });
    segmentWrapper.children().css('transition', 'all 100ms ease-out');
    segmentWrapper.children().css('opacity', '0');
  });

  if (clientVars.groupId && clientVars.canPin) {

    //init pinned pad drag and drop and sorting
    etherpad.pro.padlist.initPinDragDrop();
    if (allCookies.getItem("showPinInCollectionTip") == 'T') {
      var padSelector = etherpad.pro.padlist.getUnpinnedPadSelector();
      var msg = "Click 'Pin to top' in the menu.";
      hints.showHint($(padSelector).first().find(".gear-drop"), msg, 1000);
      var inTheYear3000 = 32503708800000;
      allCookies.setItem("showPinInCollectionTip", 'F', new Date(inTheYear3000));
    }
  }

  // init drag and drop
  etherpad.pro.padlist.initDragDrop();
  etherpad.pro.padlist.initDomainDragDrop();
});

$(window).load(function() {
  if ($("#padlist-inner").hasClass("delay-loaded")) {
    etherpad.pro.padlist.loadMore($("#padlist-inner"), 13);
    $("#padlist-inner").removeClass("delay-loaded");
  }
})

etherpad.pro.padlist.loadMore = function(target, howMany) {
  var oldLinkText = $(target).text();
  $(target).text("Loading...").on('click.hp-loading', function() { return false; });
  var excludeSelector = "#listwrap .segment-outer-wrapper, #listwrap tr[data-padid]";
  var isGlobal = false;
  var section = clientVars.selectedSection;
  if (/\/public$/.test(document.location.href)) {
    section = "public_stream";
    isGlobal = true;
  } else if (/\/hidden$/.test(document.location.href)) {
    section = "hidden_stream";
    isGlobal = true;
  }
  $.ajax({type:'get',
          url: clientVars.loadMoreUrl,
          data: {
            'show': howMany,
            'section': section,
            'excludePadIds': $(excludeSelector)
              .map(function(idx, x) {
                var id = (isGlobal ? $(x).data("subdomain") : '');
                if (id.length) {
                  id += '$';
                }
                id +=  ($(x).attr("padid") || $(x).data("padid"));
                return id;
              })
              .toArray().join(","),
            'encryptedProfileId': clientVars.encryptedProfileId,
            'encryptedGroupId': clientVars.groupId
          },
    success: function(data) {
      $(target).hide();
      if (section.indexOf("stream") > -1) {
        $(target).parents("#padtablecontainer").find("#padtable").append($(data.html).find(".segment-outer-wrapper"));
      } else {
        $(target).parents("#padtablecontainer").find("#padtable tbody").append($(data.html).find("tr"));
      }

      var $showMoreBtn = $(data.html).find('div.show-more-btn');
      if($showMoreBtn.length) {
        $(target).parents("#padtablecontainer").append($showMoreBtn);
      }
      $.extend(clientVars.canDelete, data.clientVars.canDelete);
      etherpad.pro.padlist.initStream();
      etherpad.pro.padlist.initPinDragDrop();
      etherpad.pro.padlist.initDragDrop();
      $(target).remove();
    },
    error: function() {
      $(target).text(oldLinkText).off('hp-loading');
    }
  });

  return false;
}

etherpad.pro.padlist.deletePad = function(localPadId, target) {
  if (!confirm("Are you sure you want to delete the hackpad \""+clientVars.padTitles[localPadId]+"\"?")) {
    return;
  }

  $.ajax({
    type: 'post',
    url: '/ep/padlist/delete',
    data: {padIdToDelete: localPadId},
    success: function() {
      $(target).parents("tr").hide();
      $(".segment-outer-wrapper[data-padid=" + localPadId + "]").slideUp(200);
    },
    error: function() {
    }
  });

};

etherpad.pro.padlist.removeFromCollection = function(localPadId, target) {
  $.ajax({
    type: 'post',
    url: '/ep/group/removepad',
    data: { groupId: clientVars.groupId, padId: localPadId },
    success: function(data) {
      if (data.success) {
        $(target).parents("tr").hide();
        $(".segment-outer-wrapper[data-padid=" + localPadId + "]").slideUp(200);
      } else if (data.error) {
        alert(data.error);
      }
    },
    error: function() {
    }
  });
};

etherpad.pro.padlist.toggleFollowPad = function(localPadId, target) {
  $.ajax({
    type: 'post',
    url: '/ep/pad/follow/'+localPadId,
    data: {ajax:true, followPref: 1},
    success: function() {
      $(target).parents("tr").hide();
      $(".segment-outer-wrapper[data-padid=" + localPadId + "]").slideUp(200);
    },
    error: function() {
    }
  });
}


etherpad.pro.padlist.pinPadInCollection = function(localPadId, pin, optInstantUnpin) {
  var containerSelector = "#pinnedpadscontainer";
  var padSelector = ".segment-outer-wrapper";
  var unpinnedPadSelector = etherpad.pro.padlist.getUnpinnedPadSelector(localPadId);
  var delay = 200;
  if (clientVars.selectedSection != "stream") {
    containerSelector = "#pinnedpadscontainer tbody";
    padSelector = "tr";
    delay = 0;
  }
  var padToUnpinSelector = padSelector+"[data-padid='"+localPadId+"']";

  if (optInstantUnpin) {
    $(containerSelector).find(padToUnpinSelector).hide();
    if ($(containerSelector).find(padSelector+"[data-padid]").length == 1) {
      $('#pinnedpadsseparator').hide();
    }
  }

  function revertInstantUnpin() {
    $(containerSelector).find(padToUnpinSelector).show();
    if ($(containerSelector).find(padSelector+"[data-padid]").length == 1) {
      $('#pinnedpadsseparator').show();
    }
  }

  $.ajax({
    type: 'post',
    url: '/ep/group/pin_pad',
    data: {
      padId: localPadId,
      groupId: clientVars.groupId,
      remove: pin ? 0 : 1,
      renderPad: pin ? 1 : 0
    },
    success: function(response) {
      if (response.success) {
        if (pin) {
          // Hide the suggestion message, if present
          $(containerSelector).removeClass("empty");
          var $padHTML = $(response.padHTML);
          var $container = $(containerSelector);
          if ($container.length) {
            var padListElement = $padHTML.find(padSelector);
            $container.prepend(padListElement.hide());
            padListElement.slideDown(delay);
          }
          $(unpinnedPadSelector).slideUp(delay);
          $('#pinnedpadsseparator').show();
        } else {
          $(unpinnedPadSelector).addClass('ui-draggable').slideDown(delay);
          $(containerSelector)
            .find(padToUnpinSelector)
            .slideUp(delay, function() {
              $(this).remove();
              if ($(containerSelector).find(padSelector).length == 0) {
                $(containerSelector).addClass("empty").css("display", "");
                if(etherpad.pro.padlist.getUnpinnedPadsCount() >= 5 && clientVars.selectedSection == "stream") {
                  $("#listwrap-pinned").addClass("always-show-tip");
                  $('#pinnedpadsseparator').show();
                } else {
                  $('#pinnedpadsseparator').hide();
                }
              }
            });
        }
      } else { // response.success != true
        alert(response.message);
        if(optInstantUnpin) {
          revertInstantUnpin();
        }
      }
    },
    error: function(jqXhr) {
      if (jqXhr.status == 403) {
        modals.showModal('#page-login-box');
      } else {
        alert("An error has occured. Please contact support if this error persists.");
        if(optInstantUnpin) {
          revertInstantUnpin();
        }
      }
    }
  });
}

etherpad.pro.padlist.changePinnedPadPosition = function(localPadId, afterPadId, beforePadId, optPinnedPadEl) {
  $.ajax({
    type: 'post',
    url: '/ep/group/pin_pad',
    data: {
      padId: localPadId,
      groupId: clientVars.groupId,
      afterPadId: afterPadId,
      beforePadId: beforePadId
    },
    success: function(response) {
      if (response.success) {
        optPinnedPadEl.slideUp(200, function() {
          $(this).addClass("pinned");
        });
      } else {
        alert(response.message);
        $('#pinnedpadscontainer').sortable("cancel");
      }
    },
    error: function(jqXhr, errorMsg) {
      if (jqXhr.status == 403) {
        modals.showModal('#page-login-box');
      }
      $('#pinnedpadscontainer').sortable("cancel");
    }
  });
}


etherpad.pro.padlist.pinPadInSite = function(localPadId, target, pin) {
  $.ajax({
    type: 'post',
    url: '/ep/pin-pad',
    data: {localPadId: localPadId, pinToggle: pin},
    success: function() {
      location.reload(true);
    },
    error: function() {
    }
  });
}

etherpad.pro.padlist.hidePadFromPublic = function(subdomain, localPadId, hide) {
  $.ajax({
    type: 'post',
    url: '/ep/hide-pad',
    data: {localPadId: localPadId, hide: hide, subdomain: subdomain},
    success: function() {
      $(".segment-outer-wrapper[data-padid="+localPadId+"]").slideUp();
    },
    error: function() {
    }
  });
}

etherpad.pro.padlist.toggleArchivePad = function(localPadId) {

  var inp = $("#padIdToToggleArchive");
  inp.val(localPadId);
  $("#toggle-archive-pad").submit();
};

etherpad.pro.padlist.getPinnedPadsCount = function() {
  return $(etherpad.pro.padlist.getPinnedContainerSelector()).children().length;
};

etherpad.pro.padlist.getUnpinnedPadsCount = function() {
  return $(etherpad.pro.padlist.getUnpinnedPadSelector()+":visible").length;
}
