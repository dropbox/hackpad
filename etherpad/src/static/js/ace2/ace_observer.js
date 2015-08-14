ace.observer = function() {
  var editor = null;
  var keystrokes = null;
  var mouse = null;
  var toc = null;
  var lineAnnotator = null;
  var carets = null;
  var media = null;

  function attachEditor(aceEditor) {
    editor = aceEditor;
    keystrokes = new ace.keystrokes(editor);
    mouse = new ace.mouse(editor);
    toc = new ace.ui.toc(editor);
    lineAnnotator = new ace.ui.lineAnnotator(editor);
    carets = new ace.ui.carets(editor);
    media = new ace.media(editor);

    attachEvents();
  }

  function detachEditor() {
    keystrokes = null;
    mouse = null;
    toc = null;
    lineAnnotator = null;
    carets = null;
    media = null;

    // Clear all events in the namespace.
    $(editor.getRoot()).off('.ace');

    editor = null;
  }

  function attachEvents() {
    on('blur', onBlur);
    on('capture-click', onCaptureClick);
    on('caret', onCaretUpdate);
    on('click', onClick);
    on('compositionend', onCompositionEvent);
    on('compositionstart', onCompositionEvent);
    on('dragover', onDragOver);
    on('drop', onDrop);
    on('embed', onEmbed);
    on('focus', onFocus);
    on('idlework', onIdleWork);
    on('ie-click', onIEClick);
    on('insert-image', onInsertImage);
    on('invalidate-cache', onInvalidateCache);
    on('key-event', onKeyEvent);
    on('mousedown', onMouseDown);
    on('mouseout', onMouseOut);
    on('mouseover', onMouseOver);
    on('mouseup', onMouseUp);
    on('paste', onPaste);
    on('remove-user-caret', onRemoveUserCaret);
    on('resize', onResize);
    on('scroll', onScroll);
    on('scroll-finished', onScrollFinished);
    on('scroll-throttled', onScrollThrottled);
    on('touchmove', onTouchMove);
    on('touchstart', onTouchStart);
    on('update-user-caret', onUpdateUserCaret);
  }

  function on(eventType, func) {
    $(editor.getRoot()).on('observer-' + eventType + '.ace', func);
  }

  function off(eventType) {
    $(editor.getRoot()).off('observer-' + eventType + '.ace', func);
  }

  function trigger(eventType, args) {
    $(editor.getRoot()).trigger('observer-' + eventType, args);
  }

  function triggerHandler(eventType, args) {
    return $(editor.getRoot()).triggerHandler('observer-' + eventType, args);
  }

  function onBlur(customEvent, evt) {
    mouse.onBlur(evt);
  }

  function onCaptureClick(customEvent, evt) {
    mouse.captureClick(evt);
  }

  function onCaretUpdate(customEvent, opt_force) {
    var updated = carets.onCaretUpdate(opt_force);
    if (updated) {
      pad.notifyUserCaretUpdate(carets.getCurrentCaretPosition());
    }
  }

  function onClick(customEvent, mouseEvent) {
    var proceed = mouse.processClick(mouseEvent);
    if (proceed) {
      media.onClick(mouseEvent);
      mouse.onClickMisc(mouseEvent);
    }
  }

  function onCompositionEvent(customEvent, compositionEvent) {
    mouse.onCompositionEvent(compositionEvent);
  }

  function onDragOver(customEvent, dragEvent) {
    media.onDragOver(dragEvent.originalEvent);
  }

  function onDrop(customEvent, dragEvent) {
    media.onDrop(dragEvent.originalEvent);
  }

  function onEmbed(customEvent, url, callback) {
    embed.onEmbed(url, callback);
  }

  function onFocus(customEvent, evt) {
    mouse.onFocus(evt);
  }

  function onIEClick(customEvent, mouseEvent) {
    mouse.handleIEOuterClick(mouseEvent);
  }

  function onIdleWork(customEvent, isTimeUp) {
    lineAnnotator.updateLineNumbers(ace.util.newTimeLimit(33));
    if (isTimeUp()) return;
    toc.updateTableOfContents(ace.util.newTimeLimit(33));
  }

  function onInvalidateCache(customEvent) {
    toc.invalidateCache();
    lineAnnotator.invalidateCache();
  }

  function onInsertImage(customEvent, file) {
    media.insertImage(file);
  }

  function onKeyEvent(customEvent, keyEvent) {
    keystrokes.onKeyEvent(keyEvent);
  }

  function onMouseDown(customEvent, mouseEvent) {
    media.onMouseDown(mouseEvent);
  }

  function onMouseEvent(customEvent, mouseEvent) {
    mouse.onMouseEvent(mouseEvent);
  }

  function onMouseOut(customEvent, mouseEvent) {
    mouse.handleMouseOut(mouseEvent);
  }

  function onMouseOver(customEvent, mouseEvent) {
    mouse.handleMouseOver(mouseEvent);
  }

  function onMouseUp(customEvent, mouseEvent) {
    media.onMouseUp(mouseEvent);
  }

  function onPaste(customEvent, pasteEvent) {
    media.onPaste(pasteEvent);
  }

  function onRemoveUserCaret(customEvent, userInfo) {
    carets.removeUserCaret(userInfo);
  }

  function onResize(customEvent) {
    toc.updateCurrentTOC();
    carets.updateAllCarets();
    trigger('invalidate-cache');
  }

  function onScroll(customEvent) {
    mouse.onScroll();
  }

  function onScrollFinished(customEvent) {
    toc.updateCurrentTOC();
  }

  function onScrollThrottled(customEvent, scrollEvent) {
    carets.updateAllCarets();
  }

  function onTouchStart(customEvent, touchEvent) {
    mouse.handleTouchStart(touchEvent);
  }

  function onTouchMove(customEvent, touchEvent) {
    mouse.handleTouchMove(touchEvent);
  }

  function onUpdateUserCaret(customEvent, msg, opt_force) {
    carets.updateUserCaret(msg, opt_force);
  }

  return {
    attachEditor: attachEditor,
    detachEditor: detachEditor,
    off: off,
    on: on,
    trigger: trigger,
    triggerHandler: triggerHandler
  };
};
