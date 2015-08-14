(function () {
  function Hackpad() { var bridge; try {
  console.log('Hackpad()');
  // Check that this seems like a pad page.
  var failedURLs = [];
  if (typeof $ != 'undefined') {
    failedURLs = $('link').filter(function (idx) {
      return this.loadError;
    }).map(function (idx, link) {
      return link.href;
    }).toArray();
  }
  if (typeof $ == 'undefined' || typeof clientVars == 'undefined' || failedURLs.length) {
    // console.log('$:', window.$, 'clientVars:', window.clientVars, 'failedURLs:', failedURLs);
    return JSON.stringify({ loaded: false,
                            typeofJQuery: typeof $,
                            typeofClientVars: typeof clientVars,
                            failedURLs: failedURLs });
  }
  delete failedURLs;

  function getNewPadClientVars() {
    return {
      newPad: true,
      userColor: 0,
      isProPad: true,
      isCreator: true,
      isPublicPad: false,
      invitedUserInfos: [pad.myUserInfo],
      invitedGroupInfos: [],
      initialTitle: '',
      padTitle: 'Untitled',
      collab_client_vars: {
        apool: {
          nextNum: 0,
          numToAttrib: {}
        },
        historicalAuthorData: {},
        initialAttributedText: {
          attribs: '|4+4',
          text: '%0A%0A%0A%0A'
        },
        rev: 1
      }
    };
  }

  // Set up the Obj-C bridge.
  function buildBridge (event) {
    console.log('WebViewJavascriptBridgeReady');
    bridge = (event || {}).bridge || window.WebViewJavascriptBridge;
    function bridgeLog (oldFunc) {
      var prefix = $.makeArray(arguments).slice(1);
      return function() {
        oldFunc && oldFunc.apply(this, arguments);
        var isError = arguments.callee == console.error;
        arguments = $.map($.makeArray(arguments), function (v) {
          try {
            JSON.stringify(v);
            return $.isArray(v) ? [v] : v;
          } catch (exception) {
            return v.toString();
          }
        });
        bridge.callHandler('log', {
          arguments: $.merge($.merge([], prefix), arguments),
          error: isError
        });
      }
    }
    console.log = bridgeLog(console.log);
    console.error = bridgeLog(console.error, '[error]');
    console.warn = bridgeLog(console.warn, '[warn]');
    console.info = bridgeLog(console.info, '[info]');
    console.log('WebViewJavascriptBridgeReady');

    bridge.init(function (data, responseCallback) {
      console.log("Unhandle bridge callback:", data, responseCallback);
    });

    bridge.registerHandler('autocomplete', function (data, responseCallback) {
      padautolink.finish(data.selected, data.selectedIndex);
    });

    bridge.registerHandler('quickCam', function () {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_beginAppending();
      });
    });

    bridge.registerHandler('insertImage', function (data, responseCallback) {
      /*var jpegData = atob(data);
      var ab = new ArrayBuffer(jpegData.length);
      var ia = new Uint8Array(ab);
      for (var i = 0; i < jpegData.length; i++) {
        ia[i] = jpegData.charCodeAt(i);
      }*/
      padeditor.ace.callWithAce(function(ace) {
        ace.ace_doInsertImageBlob(data /*new Blob([ab], {type: 'image/jpeg'})*/);
      });
    });

    bridge.registerHandler('canUndoRedo', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        responseCallback({ undo: ace.ace_canUndoRedo('undo'),
                           redo: ace.ace_canUndoRedo('redo') });
      });
    });

    bridge.registerHandler('doUndoRedo', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_doUndoRedo(data);
      }, data, true);
    });

    bridge.registerHandler('insertText', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_performDocumentReplaceSelection(data);
      }, 'insertText', true);
    });

    bridge.registerHandler('doDeleteKey', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_doDeleteKey();
      }, 'deleteKey', true);
    });

    bridge.registerHandler('doReturnKey', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_doReturnKey();
      }, 'returnKey', true);
    });

    bridge.registerHandler('doToolbarClick', function (data, responseCallback) {
      var heading = data.match(/^heading(\d)$/);
      if (heading) {
        padeditor.ace.callWithAce(function (ace) {
          ace.ace_doSetHeadingLevel(heading[1]);
        });
      } else {
        padeditbar.toolbarClick(data);
      }
    });

    function updateViewportWidth(width) {
      $('meta[name=viewport]').attr('content', $('meta[name=viewport]').attr('content').split(',').map(function(keyval) {
        var kv = keyval.split('=').map(function(kv) {
          return kv.trim();
        });
        if (kv[0] == 'width') {
          kv[1] = width;
        }
        return kv.join('=');
      }).join(','));
    }
    bridge.registerHandler('updateViewportWidth', function (data, responseCallback) {
      updateViewportWidth(data);
    });
    setTimeout(function () {
      bridge.callHandler('getViewportWidth', null, function (data) {
        if (data) {
          updateViewportWidth(data);
        }
      });
    });

    bridge.registerHandler('addClientVars', function (data, responseCallback) {
      $(function () {
        var thrown;
        try {
          pad.addClientVars(data || getNewPadClientVars());
        } catch (e) {
          thrown = e;
          throw e;
        } finally {
          responseCallback({ 
            success: !thrown,
            error: thrown
          });
        }
      });
    });

    bridge.registerHandler('getClientVarsAndText', function (clientVars, responseCallback) {
      var response;
      try {
        if (typeof pad === 'undefined' || !pad.collabClient) {
          return;
        }
        padeditor.ace.callWithAce(function (ace) {
          if (!ace.ace_getBaseAttributedText) {
            return;
          }
          var baseAText = ace.ace_getBaseAttributedText();
          var rep = ace.ace_getRep();
          baseAText.text = escape(baseAText.text);
          var retClientVars = $.extend(/* deep */ true, {}, clientVars || getNewPadClientVars(), {
            collab_client_vars: {
              apool: rep.apool.toJsonable(),
              initialAttributedText: baseAText,
              rev: pad.collabClient.getCurrentRevisionNumber()
            },
            newPad: false,
            padTitle: rep.lines.atIndex(0).text
          });
          // Overwrite this instead of extending, as getMissedChanges()
          // doesn't provide values if there weren't changes.
          retClientVars.collab_client_vars.missedChanges = pad.collabClient.getMissedChanges();
          response = {
            clientVars: retClientVars,
            text: ace.ace_exportText()
          };
        }, 'getClientVarsAndText', true);
      } catch (e) {
        response = {
          error: e
        };
      } finally {
        responseCallback(response);
      }
    });

    bridge.registerHandler('setVisibleEditorHeight', function (height, responseCallback) {
      if (!padeditor.setVisibleHeight) {
        return;
      }
      padeditor.setVisibleHeight(height);
      padeditor.ace.callWithAce(function (ace) {
        if (ace.ace_scrollSelectionIntoView) {
          ace.ace_scrollSelectionIntoView();
        }
      });
    });

    bridge.registerHandler('reconnectCollabClient', function (data, responseCallback) {
      if (!pad || !pad.collabClient) {
        return;
      }
      // reconnect() checks that it's in DISCONNECTED for us.
      pad.collabClient.reconnect();
    });

    bridge.registerHandler('setAttachmentURL', function (data, responseCallback) {
      padeditor.ace.callWithAce(function (ace) {
        ace.ace_setAttachmentUrl && ace.ace_setAttachmentUrl(data.attachmentId,
                                                             data.url, data.key);
        responseCallback(); 
      });
    });

    // Stuff that requires both the bridge and pad.
    $(function () {
      var ProximaNovaLightTextFace = '"ProximaNova-Light"';
      console.log('$(WebViewJavascriptBridgeReady)');
      if (typeof pad == 'undefined') {
        bridge.callHandler('documentDidFailLoad');
        return;
      }

      function delayedCall(callback, timeout) {
        var timer = 0;
        return function () {
          if (timer) {
            clearTimeout(timer);
          }
          timer = setTimeout(function () {
            timer = 0;
            callback();
          }, timeout);
        };
      }

      var oldTitleHandler = pad.handleNewTitle;
      // The first time this is called is in pad.init(), after initializing 
      // padeditor.ace and pad.collabClient, so this is a good time to add
      // our hooks to those.
      pad.handleNewTitle = function(title) {
        console.log('handleNewTitle()');
        // No need to update on every keypress.
        var setTitleDelayed = delayedCall(function () {
          bridge.callHandler('setTitle', pad.title);
        }, 250);
        pad.handleNewTitle = function (title) {
          if (pad.getPadId()) {
            oldTitleHandler.apply(this, arguments);
            setTitleDelayed();
          }
        }
        pad.handleNewTitle(title);

        var oldUserJoin = pad.handleUserJoin;
        pad.handleUserJoin = function (userInfo) {
          oldUserJoin(userInfo);
          bridge.callHandler('userInfo', { userInfo: userInfo, addUser: true });
        };
        var oldUserUpdate = pad.handleUserUpdate;
        pad.handleUserUpdate = function (userInfo) {
          oldUserUpdate(userInfo);
          bridge.callHandler('userInfo', { userInfo: userInfo, addUser: true });
        };
        var oldUserLeave = pad.handleUserLeave;
        pad.handleUserLeave = function (userInfo) {
          oldUserLeave(userInfo);
          bridge.callHandler('userInfo', { userInfo: userInfo, addUser: false });
        };
        var oldUserKill = pad.handleUserKill;
        pad.handleUserKill = function (userInfo) {
          oldUserKill(userInfo);
          bridge.callHandler('userInfo', { userInfo: userInfo, addUser: false });
        };

        var handleNetworkActivity = delayedCall(function () {
          var channelState = pad.collabClient.getChannelState
            ? pad.collabClient.getChannelState()
            : pad.collabClient.getDiagnosticInfo().channelState;
          bridge.callHandler('setHasNetworkActivity',
                             channelState != 'DISCONNECTED' &&
                             (channelState.indexOf('CONNECTING') >= 0 ||
                              pad.collabClient.hasUncommittedChanges()));
        }, 1000);

        // collabClient initializes itself as CONNECTING.
        // var oldChannelStateChange = pad.handleChannelStateChange;
        pad.handleChannelStateChange = function (channelState, moreInfo) {
          //console.log('state change:', arguments);
          // I think we handle anything needed here natively?
          // oldChannelStateChange.apply(this, arguments);
          switch (channelState) {
            case 'CONNECTED':
              bridge.callHandler('collabClientDidConnect');
              break;
            case 'DISCONNECTED':
              bridge.callHandler('collabClientDidDisconnect',
                                 pad.collabClient.hasUncommittedChanges());
              break;
          }
          handleNetworkActivity();
        };

        var handleSynchronize = delayedCall(function () {
            if (!pad.collabClient.hasUncommittedChanges) {
              return;
            }
            bridge.callHandler('collabClientDidSynchronize');          
        }, 1000);
        var oldCollabAction = pad.handleCollabAction;
        pad.handleCollabAction = function (action) {
          // console.log('collab action:', arguments);
          oldCollabAction.apply(this, arguments);
          handleNetworkActivity();
          if (action != 'commitAcceptedByServer') {
            return;
          }
          handleSynchronize();
        }

        if (pad.collabClient) {
          pad.collabClient.setOnUserJoin(pad.handleUserJoin);
          pad.collabClient.setOnUpdateUserInfo(pad.handleUserUpdate);
          pad.collabClient.setOnUserLeave(pad.handleUserLeave);
          pad.collabClient.setOnUserKill(pad.handleUserKill);
          pad.collabClient.setOnChannelStateChange(pad.handleChannelStateChange);
          pad.collabClient.setOnInternalAction(pad.handleCollabAction);
          pad.collabClient.setOnConnectionTrouble(function (msg) {
            if (msg != 'OK') {
              //console.log('connection trouble:', msg, pad.collabClient.getDiagnosticInfo().debugMessages);
              bridge.callHandler('connectionTrouble', {
                message: msg,
                debugMessages: $.makeArray(pad.collabClient.getDiagnosticInfo().debugMessages)
              });
            }
          });
        }

        padeditor.ace.callWithAce(function (ace) {
          console.log('Hackpad.callWithAce()');
          if (!pad.monospace) {
            ace.ace_setProperty('textface', ProximaNovaLightTextFace);
          }
          ace.ace_setOnOpenLink && ace.ace_setOnOpenLink(function (href, internal) {
            bridge.callHandler('openLink', { href: href, internal: internal });
          });
          ace.ace_setOnAttach(function (imageBlob, attachmentId) {
            var s3bucket = clientVars.attachmentsBucket || 'hackpad-attachments';
            var s3BucketRoot = clientVars.s3BucketRoot || 's3.amazonaws.com';
            var rootURL = "https://" + s3bucket + "." + s3BucketRoot + "/";
            bridge.callHandler('uploadImage', {
              imageBlob: imageBlob,
              attachmentId: attachmentId,
              rootURL: rootURL,
            });
          });

          // This happens in debug builds.
          if (pad.initTime && clientVars.newPad) {
              padeditor.ace.focus();
          }
        }, true, 'Hackpad.callWithAce()');
      }; // handleNewTitle()
      // If pad.init has already been called.
      if (pad.collabClient || pad.newPad) {
        pad.handleNewTitle(pad.getTitle() || '');
      }

      var oldOptionsHandler = pad.handleOptionsChange;
      pad.handleOptionsChange = function (opts) {
        oldOptionsHandler.apply(this, arguments);
        bridge.callHandler('setSharingOptions', opts);
      };

      var oldViewOptionsFunc = padeditor.setViewOptions;
      padeditor.setViewOptions = function (opts) {
        oldViewOptionsFunc(opts);
        var monospaceUnset = String(opts['useMonospaceFont']) == 'false';
        if (!monospaceUnset) {
          return;
        }
        padeditor.ace.callWithAce(function (ace) {
          ace.ace_setProperty('textface', ProximaNovaLightTextFace);
        });
      };

      var oldShowModal = modals.showModal;
      modals.showModal = function (modalId) {
        switch (modalId) {
          case '#page-login-box':
            bridge.callHandler('signIn');
            break;
          case'#freakout-dialog':
            bridge.callHandler('freakOut');
            break;
          case '#connectionbox':
            // we already detect status == DISCONNECTED natively
            break;
          default:
            oldShowModal.apply(this, arguments);
            break;
        }
      };
      if (!window.onfreakout) {
        window.onfreakout = function(msg) {
          modals.showModal("#freakout-dialog", 0, true /* not cancellable */);
        };
      }

      if (padautolink.setAutocompleteHandler) {
        padautolink.setAutocompleteHandler(function (method, data) {
          if (data) {
            data = $.map(data, function (contact) {
              var item = $('<div>').html(contact.data[0]);
              var img = item.find('img');
              return {
                title: item.text(),
                image: img && img.attr('src'),
                data: contact
              };
            });
          }
          bridge.callHandler('autocomplete', {method:method, data:data});
        });
      }

      pad.handleDelete = function () {
        bridge.callHandler('deletePad');
      };
    }); // $(WebViewJavascriptBridgeReady)
  }
  if (window.WebViewJavascriptBridge) {
    setTimeout(buildBridge);
  } else {
    document.addEventListener('WebViewJavascriptBridgeReady', buildBridge, false);
  }

  // And finally our UIWebView iframe focus hack.
  // These need to be synchronous so we can't use the bridge.
  var restoreFocus;
  window.hackpadKit.saveFocus = function() {
    var elem = document.activeElement;
    if (elem == document.body) {
      return !!restoreFocus;
    }
    while ('contentDocument' in elem) {
      elem = elem.contentDocument.activeElement;
    }
    var selection = elem.ownerDocument.getSelection();
    var ranges = [];
    for (var i = 0; i < selection.rangeCount; i++) {
      ranges[i] = selection.getRangeAt(i);
    }
    if (!ranges.length) {
      console.log('no ranges in selection:', selection);
      return false;
    }
    var savedAt = new Date;
    restoreFocus = function() {
      console.log('restoring focus after', (new Date - savedAt) / 1000, 'seconds.');
      elem.focus();
      // Without focusing the window, events fire but text isn't added to DOM.
      elem.ownerDocument.defaultView.focus();
      if (ranges.length) {
        var selection = elem.ownerDocument.getSelection();
        selection.removeAllRanges();
        for (var i = 0; i < ranges.length; i++) {
          selection.addRange(ranges[i]);
        }
      }
      selection.focusNode.parentNode.scrollIntoView(true);
      restoreFocus = null;
    };
    return true;
  };

  window.hackpadKit.restoreFocus = function () {
    restoreFocus && restoreFocus();
  };
/*
  $('head').append(
    '<style type="text/css">' +
      '@font-face {' +
        'font-family: nova; font-weight: 100; font-style: normal;' +
        'src: local(ProximaNova-Light);' +
      '}' +
      '@font-face {' +
        'font-family: nova; font-weight: 200; font-style: normal;' +
        'src: local(ProximaNova-Regular);' +
      '}' +
      '@font-face {' +
        'font-family: nova; font-weight: 700; font-style: normal;' +
        'src: local(ProximaNova-Semibold);' +
      '}' +
    '</style>'
  );
*/
  // Preload a table iframe to make sure it's cached.
  $('body').append('<iframe src="/ep/sheet" class="hide"></iframe>');

  return JSON.stringify({
    loaded: true,
    padID: clientVars.padId,
    userID: clientVars.userId,
    invitedUserInfos: clientVars.invitedUserInfos
  });
  } catch (e) {
    if (!bridge) {
      window.hackpadException = e;
      console.log('exception loading:', e);
      return;
    }
    bridge.callHandler('documentDidFailLoad', e);
  }
  } // Hackpad
  if (window.hackpadKit) {
    return JSON.stringify({ loaded: false });
  }
  window.hackpadKit = {};
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(Hackpad);
  } else {
    document.addEventListener('DOMContentLoaded', Hackpad, false );
    document.addEventListener('load', Hackpad, false);
  }
  return JSON.stringify({ loaded: true });
})();
