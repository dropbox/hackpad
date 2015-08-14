/**
 * Manages any rich media going through the Ace editor and transforms them as
 * necessary.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.media} The public methods to hook into media handler.
 */
ace.media = function(editor) {
  var observer = editor.getObserver();
  var lastZoomedImg = null;

  /**
   * Uploads images from a user's desktop, possibly shrinking it ahead of time
   * if it's large.
   * @param {File} file .
   * @param {string} attachmentId The id of the DOM node that's the placeholder
   *     for the image until it loads.
   */
  function onAttach(file, attachmentId) {
    imgshrink.maybeShrinkImage(file, function(shrunk) {
      var s3PolicyAndSig = clientVars.s3PolicyAndSig;
      var s3Policy = JSON.parse(atob(s3PolicyAndSig.s3Policy));
      var s3Conditions = s3Policy.conditions;
      var s3PolicyMap = {};
      s3Conditions.forEach(function(cond) {
        if (!(cond instanceof Array)) {
          var key = Object.getOwnPropertyNames(cond)[0];
          s3PolicyMap[key] = cond[key];
        }
      });
      var s3bucket = s3PolicyMap['bucket'];
      var s3host = "https://" + s3bucket + "." + clientVars.s3BucketRoot + "/";

      var path = location.hostname + '_' + pad.getPadId() + '_' +
          clientVars.userId + '_' + (+new Date()) + '_' + file.name;

      var form = new FormData();
      form.append('key', path);
      form.append('acl', s3PolicyMap['acl']);
      form.append('Content-Type', shrunk.type);
      form.append('X-Amz-Credential', s3PolicyMap['x-amz-credential']);
      form.append('X-Amz-Algorithm', s3PolicyMap['x-amz-algorithm']);
      form.append('X-Amz-Date', s3PolicyMap['x-amz-date']);
      form.append('Policy', s3PolicyAndSig.s3Policy);
      form.append('X-Amz-Signature', s3PolicyAndSig.s3PolicySig);
      form.append('file', shrunk);

      $.ajax({
        xhr: function() {
          var xhr = new window.XMLHttpRequest();
          xhr.upload.addEventListener("progress", function(evt) {
            if (evt.lengthComputable) {
              var progress = evt.loaded / evt.total;
              editor.callWithAce(function (ace) {
                setAttachmentUrlProgress(attachmentId, progress);
              });
            }
          }, false);
          return xhr;
        },
        url: s3host,
        data: form,
        processData: false,
        contentType: false,
        type: "POST",
        success: function() {
          setTimeout(function() {
            editor.callWithAce(function (ace) {
              setAttachmentUrl(attachmentId, s3host + path, path);
            });
            observer.trigger('track', ['file-attach', null, null,
                { success: true, padId: clientVars.padId,
                  userId: clientVars.userId, type: file.type, path: path,
                  size: file.size, uploadSize: shrunk.size }]);
          }, 500
          /* Equal to transition length so that it's not just a
           * green 100% bar. */);
        }
      }).error(function() {
        editor.callWithAce(function (ace) {
          setAttachmentUrl(attachmentId);
        });
        observer.trigger('track', ['file-attach', null, null,
            { success: false, padId: clientVars.padId,
              userId: clientVars.userId, type: file.type, path: path,
              size: file.size }]);
      });
    });
  }

  /**
   * Finds the child node that is an image.
   * TODO: replace with jQuery.
   * @param {Element} node .
   * @return {Element=} The image node, if found.
   */
  function _findFirstChildImage(node) {
    while (node) {
      node = node.childNodes[0];
      if (node && node.tagName == "IMG") {
        return node;
      }
    }
    return null;
  }

  /**
   * Takes a file and inserts it into the editor.
   * @param {File} imageBlob .
   */
  function insertImage(imageBlob) {
    // insert surrogate
    var attachmentId = "attachment-" + (+new Date());

    editor.inCallStackIfNecessary("dropImageData", function() {
      var rep = editor.getRep();
      var start = rep.selStart;
      var end = rep.selEnd;
      if (!rep.selStart || !rep.selEnd || start[0] == 0 || end[0] == 0) {
        start = end = [1, 0];
      }

      editor.performDocumentReplaceRange(start, end, '*', [
        ['img', '/static/img/pixel.gif'],
        ['attachmentPlaceholder', attachmentId]
      ]);
    });

    var returnValue = observer.triggerHandler('attach',
        [imageBlob, attachmentId]);

    // If the attach event is unhandled externally from above, we
    // process it here.
    if (returnValue === undefined) {
      onAttach(imageBlob, attachmentId);
    }
  }

  /**
   * Creates and enables the lightbox for image viewing.
   * @param {string} url The image src to show.
   */
  function zoom(url) {
    if (browser.phone) {
      return;
    }

    $(".lightbox-container").remove();

    var container = $("<div>").addClass("lightbox-container");
    $("body").append(container);
    var x = $('<button class="hp-ui-button dialog-cancel-x">' +
        '<span class="hp-ui-button-content icon-x"></span></button>');
    x.on('click', _removeLightbox);

    function _removeLightbox() {
      $(".lightbox-container").remove();
      $(document).off('keydown', lightBoxKeyPressHandler);
    }

    function _handleImageClick(prev) {
      // simple click animation
      if (prev) {
        $("#lightbox-prev img").addClass("arrow-clicked");
      } else {
        $("#lightbox-next img").addClass("arrow-clicked");
      }

      // reset click animation when done
      $('.lightbox-container img').bind(
          'animationEnd oAnimationEnd mozAnimationEnd webkitAnimationEnd',
          function() {
            $('.lightbox-container img').removeClass("arrow-clicked");
          });

      var newSrc = zoomNextImage(prev);

      if (newSrc) {
        $("#lightbox-img").hide(0);
        $("#lightbox-img").attr("src", newSrc);
        return false;
      }

      return true;
    }

    function lightBoxKeyPressHandler (e) {
      var keyCode = e.keyCode || e.which;
      var arrow = {left: 37, up: 38, right: 39, down: 40 };

      if (keyCode == arrow.left || keyCode == arrow.up) {
        _handleImageClick(true /* prev */);
      } else if (keyCode == arrow.down || keyCode == arrow.right) {
        _handleImageClick();
      }

      if (e.keyCode == 27) {
        _removeLightbox();
      }

      return false;
    }

    $(document).keydown(lightBoxKeyPressHandler);

    var inner = $("<div>").addClass('lightbox-inner').
        addClass('center-content').
        append($("<img id='lightbox-img'>").
        click(function() {
          return _handleImageClick(false)
        }).
        attr('src', url)).
        append(x);
    var outer = $("<div>").addClass('center-wrap').append(inner);
    container.append(outer);
    container.append($("<button id='lightbox-next'>" +
        "<img src='/static/img/lightbox-right.png'/></button>").
        click(function() { return _handleImageClick(false); }));
    container.append($("<button id='lightbox-prev'>" +
        "<img src='/static/img/lightbox-left.png'/></button>").
        click(function() { return _handleImageClick(true); }));
    container.css('z-index', 1000).click(_removeLightbox);

    $("#lightbox-img").bind("load",
        function () { $(this).stop(true, true).fadeIn(); });
  }

  /**
   * Finds the next image to view in the lightbox.
   * @param {Element} prev The previous image that we were viewing in the
   *     editor.
   * @return {string=} The source of the next image to view, if found.
   */
  function zoomNextImage(prev) {
    var n = lastZoomedImg;

    // try and find the next image in the current div
    while (n && !(n.tagName && n.tagName.toLowerCase() == "span" &&
        (hasClass(n, 'attrimg') || hasClass(n, 'attrembed')))) {
      n = n.parentNode;
    }

    do {
      n = (prev ? n.previousSibling : n.nextSibling);
    } while (n && !(n.tagName && n.tagName.toLowerCase() == "span" &&
        hasClass(n, 'attrimg')));


    if (n) {
      // found our next img!
      lastZoomedImg = _findFirstChildImage(n);
      // sadly chrome display bug makes this look bad:
      //scrollNodeVerticallyIntoView(lastZoomedImg, false);
      return lastZoomedImg.src;
    } else {
      n = lastZoomedImg;
    }

    while (n && !(n.tagName && n.tagName.toLowerCase() == "div" &&
        hasClass(n, 'ace-line'))) {
      n = n.parentNode;
    }

    if (!n) {
      return null;
    }

    var lineDiv = prev ? n.previousSibling : n.nextSibling;

    while (lineDiv) {
      if (_findFirstChildImage(lineDiv)) {
          lastZoomedImg = _findFirstChildImage(lineDiv);
          // sadly chrome display bug makes this look bad:
          //scrollNodeVerticallyIntoView(lastZoomedImg, false);
          return lastZoomedImg.src;
      }
      lineDiv = prev ? lineDiv.previousSibling : lineDiv.nextSibling;
    }
  }

  /**
   * Makes images (or their containers) contenteditable while dragging.
   * @param {Event} ev .
   */
  function onMouseDown(ev) {
    return;
    if (ev.target.nodeName.toLowerCase() == "img") {
      if ($(ev.target).attr("contenteditable") == "false") {
        $(ev.target).attr("contenteditable", true);
      }

      if ($(ev.target).parent().attr("contenteditable") == "false") {
        $(ev.target).parent().attr("contenteditable", true);
      }
    }
  }

  /**
   * Turns off the contenteditable attr on images (or their containers)
   * after dragging.
   * @param {Event} ev .
   */
  function onMouseUp(ev) {
    return;
    setTimeout(function() {
      if (ev.target.nodeName.toLowerCase() == "img") {
        if ($(ev.target).attr("contenteditable") == "true") {
          $(ev.target).attr("contenteditable", false);
        }

        if ($(ev.target).parent().attr("contenteditable") == "true") {
          $(ev.target).parent().attr("contenteditable", false);
        }
      }
    }, 0);
  }

  /**
   * Handles the click event on an image, to view or remove.
   * @param {Event} ev .
   */
  function onClick(evt) {
    if (evt.target.className == "inline-img") {
      lastZoomedImg = evt.target;
      zoom(evt.target.src);
      return;
    }

    if (evt.target.className == "remove-media") {
      var n = { node: evt.target, index: 0, maxIndex: 0 };
      var lineAndChar = editor.getLineAndCharForPoint(n);
      editor.inCallStack("removeMedia", function() {
        editor.performDocumentReplaceRange(
            [lineAndChar[0], lineAndChar[1] - 1],
            [lineAndChar[0], lineAndChar[1]], '');
      });
    }
  }

  /**
   * Stops the drag event if dragging a file into the editor, so that the
   * browser doesn't navigate to the file.
   * @param {Event} e .
   */
  function onDragOver(e) {
    if (e && e.dataTransfer && e.dataTransfer.items &&
        e.dataTransfer.items.length &&
        e.dataTransfer.items[0].kind == 'file') {
      e.preventDefault();
    }
  }

  /**
   * Handles the drop event when dragging in an image.
   * @param {Event} ev .
   */
  function onDrop(ev) {
    if (!ev.dataTransfer) {
      return;
    }

    if (!ev.dataTransfer.files.length) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    var foundImage = false;
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      var file = ev.dataTransfer.files[i];
      if (file.type.indexOf("image/") == 0) {
        insertImage(file);
        foundImage = true;
      }
    }

    if (!foundImage) {
      alert("Sorry, only image attachments are supported!");
    }
  }

  /**
   * Handles the paste event into the editor.
   * @param {Event} ev .
   */
  function onPaste(ev) {
    var clipboardData = ev.originalEvent.clipboardData;
    if (!clipboardData) {
      return;
    }

    // webkit table paste handling
    if (clipboardData.getData) {
      var insertTable = false;
      var pastedText = null;
      if (/text\/plain/.test(clipboardData.types)) {
        pastedText = clipboardData.getData('text/plain');
      }

      if (pastedText) {
        // parse the tabular data
        var lines = pastedText.split(/[\r|\n]+/);

        var rows = [];
        for (var i = 0; i < lines.length; i++) {
          var parts = lines[i].split("\t");
          if (parts.length > 1 &&
              (rows.length == 0 || rows[0].length == parts.length)) {
            rows.push(parts);
          } else {
            insertTable = false;
            break;
          }
          if (rows[i][0] != "") {
            // at least one value must exist in first column
            insertTable = true;
          }
        }

        // insert into doc
        if (insertTable) {
          ev.stopPropagation();
          ev.preventDefault();
          var tableData = [['table', true]];
          for (var i = 0; i < rows.length; i++) {
            for (var j = 0; j < rows[i].length; j++) {
              tableData.push([i + ":" + j, rows[i][j]]);
            }
          }

          editor.inCallStackIfNecessary("insertPastedTable", function() {
            var rep = editor.getRep();
            // make sure the table is on its own line, (and not the title line)
            if (rep.selStart[1] != 0 || rep.selStart[0] == 0) {
              editor.performDocumentReplaceRange(rep.selStart, rep.selEnd,
                  '\n', []);
            }

            editor.performDocumentReplaceRange(rep.selStart, rep.selEnd, '*',
                tableData);

            if (rep.selEnd[1] != 0) {
              editor.performDocumentReplaceRange(rep.selStart, rep.selEnd,
                  '\n', []);
            }
          });
        }
        return;
      }
    }

    // Mobile Safari doesn't provide items property.
    // TODO: investigate - which browser does this work in?
    var items = clipboardData.items || [];
    for (var i = 0; i < items.length; i++){
      if (items[i].kind == "file" && items[i].type.indexOf("image/") == 0) {
        var blob = items[i].getAsFile();
        if (blob) {
          ev.stopPropagation();
          ev.preventDefault();
          insertImage(blob);
          return;
        }
      }
    }
  }

  /**
   * Sets the url of the image after it's finished uploading.
   * @param {string} attachmentId The DOM id of the placeholder for the image
   *     until it uploads.
   * @param {string} url The source of the image.
   * @param {string} key The path of the file (without domain).  Used only on
   *     iOS currently it seems.
   */
  function setAttachmentUrl(attachmentId, url, key) {
    editor.inCallStackIfNecessary("nonundoable", function() {
      var rep = editor.getRep();
      var attachAttrNum = rep.apool.
          attribToNum[['attachmentPlaceholder', attachmentId]];

      for (var i = 0; i < rep.alines.length; i++) {
        var aline = rep.alines[i];
        var opIter = Changeset.opIterator(aline);
        var charOffset = 0;

        while (opIter.hasNext()) {
          var o = opIter.next();
          Changeset.eachAttribNumber(o.attribs, function(n) {
            if (n == attachAttrNum) {
              if (url) {
                editor.performDocumentApplyAttributesToRange(
                    [i, charOffset], [i, charOffset + o.chars], [
                    ['img', url],
                    ['attachmentKey', key],
                    ['attachmentPlaceholder', key ? null : attachmentId]]);
              } else {
                editor.performDocumentReplaceRange([i, charOffset],
                    [i, charOffset + o.chars], "");
              }
            }
          });

          charOffset += o.chars;
        }
      }
    });
  }

  /**
   * Makes a fancy progress bar for the image while it's being uploaded.
   * @param {string} attachmentId The DOM id of the placeholder for the image
   *     until it uploads.
   * @param {number} progress A percentage (0.0-1.0) telling us upload progress.
   */
  function setAttachmentUrlProgress(attachmentId, progress) {
    editor.getDynamicCSS().selectorStyle('.placeholder-' + attachmentId).
        background =
        '#3da440 linear-gradient(to right, #ccc 100%, #3da440 0%) no-repeat ' +
        $(editor.getRootSelector() + ' .ace-line').width() * progress +
        'px 0px';
  }

  // Used by iOS.
  observer.on('set-attachment', function(customEvent, attachmentId, url, key) {
    setAttachmentUrl(attachmentId, url, key);
  });

  return {
    insertImage: insertImage,
    onClick: onClick,
    onDragOver: onDragOver,
    onDrop: onDrop,
    onMouseDown: onMouseDown,
    onMouseUp: onMouseUp,
    onPaste: onPaste,
    zoom: zoom
  }
};
