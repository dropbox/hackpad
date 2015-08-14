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


var padeditbar = (function(){
  var self = {
    init: function() {
      function doToolbarClick(command) {
        return function(evt) {
          evt.preventDefault();
          self.toolbarClick(command);
          return false;
        }
      }

      // using mousedown allows us to avoid stealing selection from ace
      $("#boldbutton").mousedown(doToolbarClick('bold'));
      $("#italicsbutton").mousedown(doToolbarClick('italic'));
      $("#underlinebutton").mousedown(doToolbarClick('underline'));
      $("#strikebutton").mousedown(doToolbarClick('strikethrough'));
      $("#listbutton").click(function(){self.toolbarClick(
          'insertunorderedlist')});
      $("#numberedlistbutton").click(function(){self.toolbarClick(
          'insertorderedlist')});
      $("#taskbutton").click(function(){self.toolbarClick('inserttasklist')});
      $("#commentbutton").click(function(){self.toolbarClick('insertcomment')});
      $("#indentbutton").click(function(){self.toolbarClick('indent')});
      $("#outdentbutton").click(function(){self.toolbarClick('outdent')});
      $("#codebutton").click(function(){self.toolbarClick('code')});
      $('#attachbutton').click(function() {
        $('#toolbar-attach-group').toggleClass('open');
      });
      $('#editbutton').click(function() {
        $('#toolbar').toggleClass('open');
        $('#editbutton').toggleClass('open');
        $('body').toggleClass('edit-mode');
      });
      $('body').on('click', self.editMode);
      $('#createpadentry').on('focus', function() {
        $('body').addClass('search-focused');
      });
      $('#createpadentry').on('blur', function() {
        setTimeout(function() { $('body').removeClass('search-focused'); },
            100);
      });
      $('.toolbar-main').on('click', function(event) {
        $('#toolbar [data-type!=' + $(event.currentTarget).attr('data-type') +
            ']').removeClass('toolbar-show');
        $('#toolbar [data-type=' + $(event.currentTarget).attr('data-type') +
            ']').toggleClass('toolbar-show');
      });
      $("#editbar .editbarbutton").attr("unselectable", "on"); // for IE
      $("#editbar").removeClass("disabledtoolbar").addClass("enabledtoolbar");
      $("#insertimage").click(self.insertImage);
      $("#inserttable").click(function(){
        padeditbar.toolbarClick('tableinsert');
        return false;
      });
      $("#insertdropbox").click(self.insertDropbox);
      $("#insertbutton").click(function(evt) {
        setTimeout(function() { padeditor.ace.focus(); }, 0);
      });

      padeditor.aceObserver.on('create-page',
          padeditbar.displayPageCreationDialog);
    },
    isEnabled: function() {
      return ! $("#editbar").hasClass('disabledtoolbar');
    },
    disable: function() {
      $("#editbar").addClass('disabledtoolbar').removeClass("enabledtoolbar");
    },
    toolbarClick: function(cmd) {
      trackEvent("toolbarClick", null, null, { command: cmd });

      if (self.isEnabled()) {
        if (cmd == 'save') {
          //padsavedrevs.saveNow();
        } else if (cmd == 'tableinsert') {
          padeditor.ace.callWithAce(function (ace) {
            var rep = ace.getRep();

            // don't insert tables in title line
            var selStart = [rep.selStart[0], rep.selStart[1]];
            var selEnd = [rep.selEnd[0], rep.selEnd[1]];
            if (selStart[0] == 0) {
              selStart = [1, 0];
              selEnd = [1, 0];
              // make sure the table is on its own line,
              // (and not the title line)
              ace.replaceRange(selStart, selStart, '\n\n', []);
            } else {
              // make sure the table is on its own line,
              // (and not the title line)
              ace.replaceRange(selStart, selEnd, '\n\n', []);
              selStart = [selStart[0] + 1, 0];
            }
            ace.replaceRange(selStart, selStart, '*', [['table', '123']]);
            padeditor.ace.focus();

          }, cmd, true);
          return;
        } else {
          padeditor.ace.callWithAce(function (ace) {
            padeditor.ace.focus();
            if (cmd == 'bold' || cmd == 'italic' || cmd == 'underline' ||
                cmd == 'strikethrough') {
              ace.toggleAttributeOnSelection(cmd);
            } else if (cmd == 'undo' || cmd == 'redo') {
              ace.doUndoRedo(cmd);
            } else if (cmd == 'insertunorderedlist') {
              ace.doInsertUnorderedList();
            } else if (cmd == 'insertorderedlist') {
              ace.doInsertOrderedList();
            } else if (cmd == 'inserttasklist') {
              ace.doInsertTaskList();
            } else if (cmd == 'code') {
              ace.doInsertCodeList();
            } else if (cmd == 'insertcomment') {
              ace.doInsertComment();
            } else if (cmd == 'indent') {
              if (! ace.doIndentOutdent(false)) {
                ace.doInsertUnorderedList();
              }
            } else if (cmd == 'outdent') {
              ace.doIndentOutdent(true);
            } else if (cmd == 'clearauthorship') {
              if ((!(ace.getRep().selStart && ace.getRep().selEnd)) ||
                  ace.isCaret()) {
                if (window.confirm(
                    "Clear authorship colors on entire document?")) {
                  // this should exec a command
                  var lines = ace.getRep().lines;
                  ace.performDocumentApplyAttributesToRange([0,0],
                      [lines.length, lines[lines.length-1]],
                      [['author', '']]);
                }
              } else {
                ace.setAttributeOnSelection('author', '');
              }
//            } else if (cmd == 'committoouter') {
            } else if (cmd == 'header-1' || cmd == 'header-2') {
              ace.doSetHeadingLevel(cmd.split('-')[1]);
            }
          }, cmd, true);
        }
      }
      padeditor.ace.focus();
    },
    editMode: function(event) {
      if ((!$(event.target).parents('body > header').length &&
          !$(event.target).parents('#padeditor').length &&
          !$(event.target).parents('#padsidebar').length &&
          !$(event.target).parents('#mainmodals').length &&
          !$(event.target).is('#modaloverlay') &&
          !$(event.target).parents('#modaloverlay').length &&
          !$(event.target).is('.lightbox-container') &&
          !$(event.target).parents('.lightbox-container').length) ||
          $(event.target).is('#padeditor') ||
          $(event.target).is('#createpadform2') ||
          $(event.target).parents('#createpadform2').length) {
        $('body').removeClass('edit-mode');
      } else if ($(event.target).is('#editor') ||
          $(event.target).parents('#editor').length) {
        $('body').addClass('edit-mode');
      }
    },
    insertImage: function() {
      padmodals.showModal('#insertimagedialog', 0);

      if (!!window.FileReader) {
        $("#web-image-upload").off('change').on('change', function() {
          for (var x = 0; x < this.files.length; ++x) {
            padeditor.aceObserver.trigger('insert-image', [this.files[x]]);
          }
          padmodals.hideModal(0);
        });
      } else {
        $("#web-image-upload, #web-image-upload-separator").hide();
      }

      $("#insert-image-form")[0].reset();
      $("#insert-image-form").unbind('submit').submit(function() {
        var url = $("#web-image-url").val();

        if (!url.match(/^https?:\/\/.*/)) {
         url = "http://" + url;
        }

        padeditor.ace.callWithAce(function (ace) {
          var rep = ace.getRep();
          ace.replaceRange(rep.selStart, rep.selEnd, '*', [['img', url]]);
          padeditor.ace.focus();
          padmodals.hideModal(0);
        }, 'insertimage', true);

        return false;
      });

      $(document).on('dragover', '#insertimagedialog', function(e) {
        // let the document surface handle this
        e.preventDefault();
        e.stopPropagation();
        padmodals.hideModal(0);
      });

      return false;
    },
    insertDropbox: function() {
      trackEvent("toolbarClick", "dropbox", null, { command: "dropbox" });

      Dropbox.choose({
        linkType: "preview",
        multiselect: true,
        success: function(files) {
          function _insert(text, attrs) {
            padeditor.ace.callWithAce(function (ace) {
              var rep = ace.getRep();
              ace.replaceRange(rep.selStart, rep.selEnd, text, attrs);
            }, "insertdropbox", true);
          }

          var nonImgFiles = files.filter(function (f) {
            if (f.thumbnails && f.thumbnails["640x480"]) {
              _insert('*', [['img', f.thumbnails["640x480"]]]);
              return false;
            }
            return true;
          });

          if (nonImgFiles.length && nonImgFiles.length < files.length) {
            // newline after images
            _insert("\n\n");
          }

          nonImgFiles.map(function (f) {
            _insert(f.name, [['link', f.link]]);
            _insert("\n");
          });

          padeditor.ace.focus();
        }
      });
      return false;
    },
    setSyncStatus: function(status) {
      if (status == "done") {
        $("#last-saved-timestamp").attr("title", toISOString((new Date())));
        $("#last-saved-timestamp").prettyDate();
        // prettyDate called in pad2 every 5 seconds
        //setInterval(function(){ $("#last-saved-timestamp").prettyDate(); },
        //    5000);

        $("#last-edited-by").hide();
        $("#last-saved").show();
      }
    },
    _insertLink: function(title, url) {
      padeditor.ace.callWithAce(function(ace) {
        var rep = ace.getRep();
        var ss = rep.selStart;
        var se = [ss[0], ss[1]+title.length];
        ace.replaceRange(rep.selStart, rep.selEnd, title);
        ace.performDocumentApplyAttributesToRange(ss, se, [['link', url]]);
        if ($.browser.mozilla) {
          var insertionPoint = [ss[0], ss[1]+title.length];
          ace.replaceRange(insertionPoint, insertionPoint, " ");
        }
      }, "linkinsert", true);
    },
    displayPageCreationDialog: function(evt, atext, apool, title) {
      var selection = atext.text;

      trackEvent("pageCreateDialogShow", null, null, {
          selection: selection.length, lines: selection.split("\n").length });

      var urlEncodedTitle = title.replace(/ /g, '-');
      $.post('/ep/pad/ajax_create',
          { title: title,
            text: atext.text,
            attribs: atext.attribs,
            apool: JSON.stringify(apool),
            sourcePadId: pad.getPadId() },
          function(response) {
            var padUrl = "/" + response + "#" + urlEncodedTitle;
            self._insertLink(title, padUrl);

            trackEvent("pageCreateDialogDone", null, null,
                { selection: selection, padUrl: padUrl });
          }
      );
    }
  };


  return self;
}());
