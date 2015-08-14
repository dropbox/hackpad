/**
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

import("funhtml.*");
import("jsutils.*");
import("stringutils");

import("etherpad.collab.ace.easysync2.Changeset");
import("etherpad.control.pro.pro_main_control.decorateWithSegments");
import("etherpad.control.pad.pad_view_control.{getPadSummaryHTML,getPadFirstNLinesHTML}");
import("etherpad.utils.*");
import("etherpad.helpers");
import("etherpad.pad.padutils");
import("etherpad.collab.collab_server");
import("etherpad.changes.changes");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts.getSessionProAccount");

import("etherpad.pad.padusers");
import("etherpad.collab.collab_server");
import("etherpad.log");

jimport("java.util.PriorityQueue");


function _getColumnMeta() {
  // returns map of {id --> {
  //    title,
  //    sortFn(a,b),
  //    render(p)
  // }

  function _dateNum(d) {
    if (!d) {
      return 0;
    }
    return -1 * (+d);
  }


  var cols = {};

  function addAvailableColumn(id, cdata) {
    if (!cdata.render) {
      cdata.render = function(p) {
        return p[id];
      };
    }
    if (!cdata.cmpFn) {
      cdata.cmpFn = function(a,b) {
        return cmp(a[id], b[id]);
      };
    }
    cdata.id = id;
    cols[id] = cdata;
  }
  addAvailableColumn('public', {
    title: "",
    render: function(p) {
      // TODO: implement an icon with hover text that says public vs.
      // private
      return "";
    },
    cmpFn: function(a,b) {
      return 0; // not sort-able
    }
  });
  addAvailableColumn('secure', {
    title: "",
    render: function(p) {
      if (p.password) {
        return IMG({src: '/static/img/padlock.gif'});
      } else {
        return "";
      }
    },
    cmpFn: function(a,b) {
      return cmp(a.password, b.password);
    }
  });

  addAvailableColumn('dragHandle', {
    title: "Drag Handle",
    render: function(p) {
      return DIV({className:"drag-handle"});

    },
    cmpFn: function(a,b) {
      return 0; // not sort-able
    }
  });

  addAvailableColumn('title', {
    title: "Title",
    render: function(p) {
      var sp = SPAN();
      if (p.proAttrs) {
        var currentUserAccountId = pro_accounts.getSessionProAccount() && pro_accounts.getSessionProAccount().id;
        var editors = [];
        var includeNoPhoto = false;
        var MAX_USER_PICS = 1; // using more than one *will* break layout.
        for (var i=0; i<p.proAttrs.editors.length && (editors.length<MAX_USER_PICS); i++ ) {
          var editorId = p.proAttrs.editors[i];

          if (editorId != currentUserAccountId) {
            var pic = pro_accounts.getPicById(editorId);
            if (pic) {
              editors.push([editorId, pic]);
            } else {
              includeNoPhoto = true;
            }
          }
        }

        for (var i = 0; i < Math.min(editors.length, MAX_USER_PICS); i++) {
          sp.push(IMG({src:editors[i][1], style:"width:24px; height:24px; padding:1px; vertical-align:middle;"}));
        }
        if (includeNoPhoto && editors.length < MAX_USER_PICS) {
          sp.push(IMG({src:"/static/img/nophoto.png", style:"width:24px; height:24px; padding:1px; vertical-align:middle;"}));
        }
      }

      var s = "";
      if (p.groupNames && p.groupNames.length) {
        s += " - " + p.groupNames.join(", ");
      }

      var t = padutils.getProDisplayTitle(p.localPadId, p.title);
      sp.push(IMG({src:'/static/img/dragdots.png', className:'dragdots iphonehide'}), SPAN({className:"title-link"}, t), SPAN({className:"subtitle"},s));
      return sp;

    },
    sortFn: function(a, b) {
      return cmp(padutils.getProDisplayTitle(a.localPadId, a.title),
                 padutils.getProDisplayTitle(b.localPadId, b.title));
    }
  });


  addAvailableColumn('titleConnected', {
    title: "Title",
    render: function(p) {
      var t = padutils.getProDisplayTitle(p.localPadId, p.title);
      var cnt = collab_server.getNumConnectionsByPadId(padutils.getGlobalPadId(p.localPadId));
      if (cnt) {
        return SPAN({className:"title-link"}, t + " ",
          SPAN({"class": "connectedCount"},
            cnt + (cnt > 1 ? " people contributing" : " person contributing")));
      } else {
        return SPAN({className:"title-link"}, t);
      }
    },
    sortFn: function(a, b) {
      return cmp(padutils.getProDisplayTitle(a.localPadId, a.title),
        padutils.getProDisplayTitle(b.localPadId, b.title));
    }
  });
  addAvailableColumn('creatorId', {
    title: "Creator",
    render: function(p) {
      return pro_accounts.getFullNameById(p.creatorId);
    },
    sortFn: function(a, b) {
      return cmp(pro_accounts.getFullNameById(a.creatorId),
                 pro_accounts.getFullNameById(b.creatorId));
    }
  });
  addAvailableColumn('createdDate', {
    title: "Created",
    render: function(p) {
      return timeAgo(p.createdDate);
    },
    sortFn: function(a, b) {
      return cmp(_dateNum(a.createdDate), _dateNum(b.createdDate));
    }
  });
  addAvailableColumn('lastEditorId', {
    title: "Last Editor",
    render: function(p) {
      if (p.lastEditorId) {
        return pro_accounts.getFullNameById(p.lastEditorId);
      } else {
        return "";
      }
    },
    sortFn: function(a, b) {
      var a_ = a.lastEditorId ? pro_accounts.getFullNameById(a.lastEditorId) : "ZZZZZZZZZZ";
      var b_ = b.lastEditorId ? pro_accounts.getFullNameById(b.lastEditorId) : "ZZZZZZZZZZ";
      return cmp(a_, b_);
    }
  });

  addAvailableColumn('editors', {
    title: "Editors",
    render: function(p) {
      var editors = [];
      p.proAttrs.editors.forEach(function(editorId) {
        editors.push([editorId, pro_accounts.getFullNameById(editorId)]);
      });
      editors.sort(function(a,b) { return cmp(a[1], b[1]); });

      var sp = SPAN();
      for (var i = 0; i < editors.length; i++) {
        if (i > 0) {
          sp.push(", ");
        }

        var editor = editors[i][1];
        sp.push(A({href: "/ep/padlist/edited-by?editorId="+editors[i][0]}, editor));
      }

      return sp;
    }
  });

  addAvailableColumn('lastEditedDate', {
    title: "Last Edited",
    render: function(p, now) {
      if (p.lastEditedDate) {
        return timeAgo(p.lastEditedDate, now);
      } else {
        return "";
      }
    },
    sortFn: function(a,b) {
      // for some reason _dateNum reverses signs, so we do as well
      if (a.isPinned || b.isPinned) {
        return cmp(a.isPinned?0:1, b.isPinned?0:1);
      }
      return cmp(_dateNum(a.lastEditedDate), _dateNum(b.lastEditedDate));
    }
  });

  addAvailableColumn('lastViewedDate', {
    title: "Last Viewed",
    render: function(p) {
      if (p.lastViewedDate) {
        return timeAgo(p.lastViewedDate);
      } if (p.lastEditedDate) {
        return timeAgo(p.lastEditedDate);
      } else {
        return "";
      }
    },
    sortFn: function(a,b) {
      // for some reason _dateNum reverses signs, so we do as well
      if (a.isPinned || b.isPinned) {
        return cmp(a.isPinned?0:1, b.isPinned?0:1);
      }

      return cmp(_dateNum(a.lastViewedDate || a.lastEditedDate),
      _dateNum(b.lastViewedDate || b.lastEditedDate));
    }
  });

  addAvailableColumn('localPadId', {
    title: "Path",
  });

  addAvailableColumn('actions', {
    title: "",
    render: function(p) {
      return DIV({className: "gear-drop icon-gear",
          id: "pad-gear-"+p.localPadId}, "");
    }
  });

  addAvailableColumn('collection-actions', {
    title: "",
    render: function(p) {
      return DIV({className: "gear-drop icon-gear",
          tooltip: "Remove", id: "pad-gear-"+p.localPadId}, "");
    }
  });


  addAvailableColumn('connectedUsers', {
    title: "Connected Users",
    render: function(p) {
      var names = [];
      padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
        var userList = collab_server.getConnectedUsers(pad);
        userList.forEach(function(u) {
          if (collab_server.translateSpecialKey(u.specialKey) != 'invisible') {
            // excludes etherpad admin user
            names.push(u.name);
          }
        });
      }, 'r');
      return names.join(", ");
    }
  });

  addAvailableColumn('taskCount', {
    title: "Tasks",
    render: function(p) {
      return padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
        var info = pad.getTaskCounts();
        var txt = " / " + (info.completed + info.open);
        var percentCompleted = parseInt(info.completed / (info.completed + info.open) * 100, 10);
        if (info.open == 0 && info.completed > 0) {
          return DIV({className: "alldone",
              style: "background: #ccc linear-gradient(to right, #3da440 " + percentCompleted + "%, #ccc 0%)"},
              DIV({class: "icon-check"}),
              SPAN({class: "task-completed-count"}, info.completed),
              txt);
        } else if (info.open) {
          return DIV({className: "open",
              style: "background: #ccc linear-gradient(to right, #3da440 " + percentCompleted + "%, #ccc 0%)"},
              DIV({class: "icon-check"}),
              SPAN({class: "task-completed-count"}, info.completed),
              txt);
        }
        return "";
      }, 'r', true /*skipAccess*/);
    }
  });

  addAvailableColumn('time', {
    title: "Time",
    render: function(p) {
      return padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
        return pad.getDataRoot()['time'] || "";
      }, 'r', true /*skipAccess*/);
    }
  });

  addAvailableColumn('groupNames', {
    title: "Groups",
    render: function(p) {
      if (p.groupNames) {
        return p.groupNames.join(",");
      } else {
        return '';
      }
    }
  });
  return cols;
}

function _sortPads(padList, opt_columnMeta) {
  request.profile.tick('before sorting ' + padList.length + ' pads');

  var meta = opt_columnMeta || _getColumnMeta();
  var sortId = _getCurrentSortId();
  var reverse = false;
  if (sortId.charAt(0) == '-') {
    reverse = true;
    sortId = sortId.slice(1);
  }
  //padList.sort(function(a,b) { return cmp(a.localPadId, b.localPadId); });
  padList.sort(function(a,b) { return meta[sortId].sortFn(a, b); });
  if (reverse) { padList.reverse(); }

  request.profile.tick('after sort');

}

function _addClientVars(padList) {
  var padTitles = helpers.getClientVar('padTitles') || {}; // maps localPadId -> title
  var canDelete = helpers.getClientVar('canDelete') || {};

  var currentAccountId = getSessionProAccount() && getSessionProAccount().id;
  padList.forEach(function(p) {
    padTitles[p.localPadId] = stringutils.toHTML(padutils.getProDisplayTitle(p.localPadId, p.title));
    if (p.creatorId == currentAccountId || pro_accounts.isAdminSignedIn()) {
      canDelete[p.localPadId] = 1;
    }
  });

  request.profile.tick('add client vars');

  helpers.addClientVars({
    padTitles: padTitles,
    canDelete: canDelete,
    facebookClientId: appjet.config.facebookClientId,
  });
}

function _getCurrentSortId() {
  return request.params.sortBy || "lastViewedDate";
}

function _renderColumnHeader(m) {
  var sp = SPAN();
  var sortBy = _getCurrentSortId();
  if (m.sortFn) {
    var d = {sortBy: m.id};
    var arrow = "";
    if (sortBy == m.id) {
      d.sortBy = ("-"+m.id);
      arrow = html("&#8595;");
    }
    if (sortBy == ("-"+m.id)) {
      arrow = html("&#8593;");
    }
    sp.push(arrow, " ", A({href: qpath(d)}, m.title));
  } else {
    sp.push(m.title);
  }
  return sp;
}

function _renderSinglePadListItem(pad, columnIds, columnMeta) {
  // Note that this id is always numeric, and is the actual
  // canonical padmeta id.
  var row = TR({'data-padid':pad.localPadId ,className: pad.isPinned ? 'nav-item pinned' : 'nav-item'});
  var first = true;
  var urlTitle = pad.title && pad.title.replace(' ', '-', "g");

  for (var i = 0; i < columnIds.length; i++) {
    var cid = columnIds[i];
    var m = columnMeta[cid];

    var classes = cid + (columnMeta[cid].className || "");

    if (i == 0) {
      classes += (" first");
    }
    if (i == (columnIds.length - 1)) {
      classes += (" last");
    }
    var cellInner = SPAN({}, m.render(pad));
    var cellLink = A({className:"cell-link", href: "/"+encodeURIComponent(pad.localPadId)});
    cellLink.push(cellInner);

    var cell = TD({className: classes}, "");
    cell.push(cellLink);
    row.push(cell);
  }
  return row;
}

function renderPadList(padList, columnIds, limit, noSort) {
  /* fixme: pro_facebook.getFacebookFriendsWhoUseApp can cause the padlist to be corrupted somehow.
   * filter here to avoid exceptions for a list of null pads.
   */
  padList = padList.filter(function(p) { return p !== undefined });

  var columnMeta = _getColumnMeta();

  if (!noSort) {
    _sortPads(padList, columnMeta);
  }

  var available = padList.length;
  limit = parseInt(limit);
  if (limit && (limit < padList.length)) {
    padList = padList.slice(0,limit);
  }

  var container = DIV({id:"padtablecontainer"});
  var o = _renderPadsListTable(padList, columnIds, container, "padtable");

  if (limit && available > limit) {
    var newLimit = Math.min(available, limit+20);
    o.push(DIV({style:"clear:both; float: left; padding-left:10px", className:"show-more-btn"}, A({href:"#", onclick:"return etherpad.pro.padlist.loadMore(this, "+ newLimit +")"}, "Show more")));
  }

  return o;
}

function _htmlString(str) {
  return { toHTML: function () { return str; } };
}

function mergeSegments(first, second, apool){
  return [first[0]/*startRev*/, second[1]/*endRev*/,
      uniqueStrings(first[2].concat(second[2])), second[3]/*endTime*/,
      Changeset.compose(first[4], second[4], apool) /*cs*/];
}

function _renderPadsListTable(padList, columnIds, container, tableId) {
   var columnMeta = _getColumnMeta();

  _addClientVars(padList);

  var showSecurityInfo = false;
  padList.forEach(function(p) {
    if (p.password && p.password.length > 0) { showSecurityInfo = true; }
  });
  if (!showSecurityInfo && (columnIds[0] == 'secure')) {
    columnIds.shift();
  }

  var o = container;
  var t = TABLE({id: tableId});
  var tbody = TBODY();
  t.push(tbody);
  request.profile.tick('before pads');
  padList.forEach(function(p) {
    if (!p) {
      return;
    }
    var row = _renderSinglePadListItem(p, columnIds, columnMeta);
    tbody.push(row);
    request.profile.tick('pad');
  });
  o.push(t);
  return o;
}

function renderPinnedPadsList(padList, columnIds) {
  var container = DIV({id:"pinnedpadscontainer"});
  return _renderPadsListTable(padList, columnIds, container, "pinnedpadtable");
}

function renderPinnedPadsListStream(pads, options) {
  var opts = extend({
    showTaskCount: false,
    showFirstNLines: 2
  }, options);
  var classes = "streamtable";
  if (!pads.length) {
    classes += " empty";
  }
  var div = DIV({id:"pinnedpadscontainer", 'class': classes});
  var columnMeta = _getColumnMeta();
  pads.forEach(function(p) {
    if (!p) {
      return;
    }
    var segmentInfo = _generateSegmentInfoForPad(p);
    if (!segmentInfo) {
      return;
    }

    var diffHTMLAndAuthors = segmentInfo.diffHTMLAndAuthors;
    if ((!diffHTMLAndAuthors || !diffHTMLAndAuthors.diffHTML || diffHTMLAndAuthors.diffHTML == '')) {
      diffHTMLAndAuthors = {diffHTML: "", authorsHTML: ""};
    }
    padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
      diffHTMLAndAuthors.diffHTML = getPadFirstNLinesHTML(pad, opts.showFirstNLines);
    }, 'r');
    opts.domainId = p.domainId;
    var padStreamItem = _renderPadStreamItem(p, segmentInfo.segment, segmentInfo.picAccountId, diffHTMLAndAuthors, columnMeta, opts);
    div.push(padStreamItem);
  });
  return div;
}

function newRenderPadListStream(pads, limit, areMorePadsAvailable, delayLoad, options) {
  var opts = extend({
    showTaskCount: false,
    maxDiffLines: 100,
    showFirstNLines: false,
    stopAtEmptyLine: false,
    hideElipsis: false
  }, options);

  if (delayLoad) {
    limit = 7;
    // update areMorePadsAvailable
    areMorePadsAvailable = areMorePadsAvailable  || (limit < pads.length);
  }

  // fill client vars
  pads = pads.filter(function(p) { return p !== undefined });
  _addClientVars(pads);

  var columnMeta = _getColumnMeta();
  var c = DIV({id:"padtablecontainer"});
  var o = DIV({id:"padtable", 'class':"streamtable"});
  c.push(o);

  var stories = 0;

  var sortedPads = new java.util.PriorityQueue(pads.length || 1,
    new java.util.Comparator({
      compare: function(o1, o2) { return o2.lastEditedDate - o1.lastEditedDate}
    }));
  pads.forEach(function(p) {
    sortedPads.add(p);
  });

  while (!sortedPads.isEmpty()) {
    var p = sortedPads.poll();

    if (stories == limit) {
      break;
    }
    // Show the pad creator pic if we're rendering the top of the pad and not the latest diff.
    var picAccountId = opts.showFirstNLines ? p.creatorId : p.lastEditorId;
    var lastEditedDate = p.lastEditedDate;
    var diffHTMLAndAuthors = {diffHTML: "", authorsHTML: ""};

    try {
      var isMultipleAuthors = false;
      if (opts.showFirstNLines) {
        padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
          var html = getPadFirstNLinesHTML(pad, opts.showFirstNLines, opts.stopAtEmptyLine );
          diffHTMLAndAuthors.diffHTML = html;
          if (p.lastEditorId && p.lastEditorId > -1) {
            diffHTMLAndAuthors.authorsHTML = "<a href='" + pro_accounts.getUserLinkById(p.lastEditorId) + "'>" + toHTML(pro_accounts.getFullNameById(p.lastEditorId)) + "</a>";
          }
        }, 'r');
      } else {
        var segmentInfo = _generateSegmentInfoForPad(p, opts.maxDiffLines, opts.hideElipsis);
        if (!segmentInfo) {
          continue;
        }
        isMultipleAuthors = segmentInfo.segment && segmentInfo.segment[2].length > 1;
        diffHTMLAndAuthors = segmentInfo.diffHTMLAndAuthors;
        if ((!diffHTMLAndAuthors || !diffHTMLAndAuthors.diffHTML || diffHTMLAndAuthors.diffHTML == '')) {
          if (p.segments.length > 0) {
            // if this set of segments was empty but there's more segments to consider,
            // keep this pad in the priority queue
            p.lastEditedDate = new Date(p.segments[0][3])/*segmentEndTime*/;
            sortedPads.add(p);
            continue;
          } else {
            diffHTMLAndAuthors = {diffHTML: "", authorsHTML: ""};
          }
        }
        lastEditedDate = segmentInfo.segment && segmentInfo.segment[3];
        picAccountId = segmentInfo.picAccountId;
      }

      opts.domainId = p.domainId;
      o.push(renderPadStreamItem(p.localPadId, p.title, p.isPinned, lastEditedDate, picAccountId, diffHTMLAndAuthors.authorsHTML, diffHTMLAndAuthors.diffHTML, columnMeta, opts, p.groupInfos, isMultipleAuthors /* multiple authors */));
      stories++;
    } catch (ex) {
      log.logException(ex);
    }
  }

  if (areMorePadsAvailable) {
    var newLimit = limit + 20;
    var className = "show-more-btn";
    if (delayLoad) {
      className += " delay-loaded";
    }
    c.push(DIV({className: className, id:"padlist-inner", style:"clear:both; float: left; padding-left:10px"}, A({href:"#", onclick:"return etherpad.pro.padlist.loadMore(this, "+ newLimit +")"}, "Show more")));
  }

  return c;
}

function _generateSegmentInfoForPad(p, maxlines, optHideElipsis) {
  var segment;
  var diffHTMLAndAuthors = null;
  var picAccountId = null;
  try {
    padutils.accessPadGlobal(p.domainId, p.localPadId, function(pad) {
      if (!p.segments) {
        decorateWithSegments([p]);
      }

      if (p.segments.length > 0) {
        // merge any segments which are in edit window (3h?)
        var segmentsMerged = 1;
        segment = p.segments.reduce(function(merged, current) {
          if (merged[3] -  current[3] < 1000*60*60*3) {
            segmentsMerged++;
            return mergeSegments(current, merged, pad.pool());
          } else {
            // segment too old, stop merging
            return merged;
          }
        });

        // leave only unmerged segments
        p.segments = p.segments.slice(segmentsMerged);

        // is this a segment about me?
        var meSegment = false;
        var segmentAuthors = segment[2];
        if (segmentAuthors.length == 1 && segmentAuthors[0]) {
          var onlyAuthorId = padusers.getAccountIdForProAuthor(segmentAuthors[0]);
          if (getSessionProAccount() && onlyAuthorId == getSessionProAccount().id) {
            meSegment = true;
          }
        }

        var colorIdForAuthor = {};
    //    if (segment[2].length > 1) {
          var historicalAuthorData = collab_server.buildHistoricalAuthorDataMapForPadHistory(pad);
          for (var author in historicalAuthorData) {
            var accountId = padusers.getAccountIdForProAuthor(author);
            colorIdForAuthor[accountId] = historicalAuthorData[author].colorId;
          }
    //    }

        diffHTMLAndAuthors = changes.getDiffAndAuthorsHTML(pad, segment[0], segment[1], segment[2], colorIdForAuthor, false, segment[4], true, maxlines, optHideElipsis);

        if (meSegment) {
          diffHTMLAndAuthors.authorsHTML = ' you ';
        }

        if (segment[2].length) {
          picAccountId = padusers.getAccountIdForProAuthor(segment[2][0]);
        } else {
          picAccountId = 0;
        }
      }
    }, 'r', true);
  } catch(ex) {
    var globalPadId = padutils.getGlobalPadId(p.localPadId, p.domainId);
    log.logException("Failed to generate segments for " + globalPadId);
    log.logException(ex);
    return null;
  }

  return {
    segment: segment,
    picAccountId: picAccountId,
    diffHTMLAndAuthors: diffHTMLAndAuthors
  };
}

function _renderPadStreamItem(p, segment, picAccountId, diffHTMLAndAuthors, columnMeta, options) {
  return renderPadStreamItem(p.localPadId, p.title, p.isPinned, segment && segment[3], picAccountId,
    diffHTMLAndAuthors.authorsHTML, diffHTMLAndAuthors.diffHTML, columnMeta, options, p.groupInfos);
}

function renderPadStreamItem(localPadId, title, isPinned, lastEditedDate, picAccountId, authorsHTML, diffHTML, optColumnMeta, options, groupInfos, opt_isMultipleAuthors) {

  var opts = extend({
    titleIsEscaped: false,
    showTaskCount: false,
    domainId: null,
    isGlobal: false
  }, options);

  var p = {
    domainId: opts.domainId,
    localPadId: localPadId,
    title: opts.titleIsEscaped ? _htmlString(title) : title,
    isPinned: isPinned,
    groupInfos: groupInfos || []
  };

  var domain;
  if (opts.isGlobal && opts.domainId) {
    domain = domains.getDomainRecord(opts.domainId);
    if (!domain) {
      return;
    }
  }

  var columnMeta = optColumnMeta || _getColumnMeta();
  var urlTitle = title && title.replace(' ', '-', "g");
  var picUrl = picAccountId ? pro_accounts.getPicById(picAccountId, false) : null;
  var picLinkUrl = picAccountId ? pro_accounts.getUserLinkById(picAccountId) : null;
  return _htmlString(renderTemplateAsString('_stream_entry.ejs', {
    columnMeta:columnMeta,
    onOtherDomain: opts.isGlobal && domain && domain.id > 1,
    isGlobal: opts.isGlobal,
    localPadId:localPadId,
    domain: domain,
    urlTitle:urlTitle,
    picLinkUrl:picLinkUrl,
    picUrl:picUrl,
    isMultipleAuthors: opt_isMultipleAuthors,
    opts:opts,
    absoluteUrl: absoluteURL,
    absolutePadUrl: absolutePadURL,
    relativePadUrl: relativePadUrl,
    relativeCollectionUrl: relativeCollectionUrl,
    authorsHTML: authorsHTML,
    lastEditedDate:lastEditedDate,
    diffHTML:diffHTML,
    groupInfos: groupInfos,
    p:p
  }));

}
