/**
 * Manages the editor's tables.
 * @param {ace.editor} editor The editor public interface.
 * @return {ace.tables} The public methods to hook into the tables.
 */
ace.tables = function(editor) {
  /**
   * Listens for changes to the table and makes updates as needed.
   * @param {Element} e .
   * @param {Array} changes A list of changes to to the table.
   *     Christ, who comes up with these data structures? ...
   */
  window.handleTableChange = function(e, changes) {
    // find the right div
    var n = { node: e, index: 0, maxIndex: 0 };
    var lineAndChar = editor.getLineAndCharForPoint(n);
    var attribs = [];

    for (var i = 0; i < changes.length; i++) {
      var row = changes[i][0];
      var col = changes[i][1];
      var previousValue = changes[i][2];
      var newValue = changes[i][3];
      var setValueAttribs = changes[i][4];
      var removeValueAttribs = changes[i][5];

      attribs.push([row + ":" + col, newValue]);
      for (var j = 0; j < setValueAttribs.length; j++) {
        attribs.push([row + ":" + col + ":" + setValueAttribs[j], true]);
      }
      for (var j = 0; j < removeValueAttribs.length; j++) {
        attribs.push([row + ":" + col + ":" + removeValueAttribs[j]]);
      }
    }

    editor.inCallStackIfNecessary("tableChanges", function() {
      editor.performDocumentApplyAttributesToRange(lineAndChar,
          [lineAndChar[0], lineAndChar[1] + 1], attribs);
    });
  }

  /**
   * Splice new data into a table.
   * @param {Array.<Object>} lineEntries The lines to look at.
   * @param {Array.<string>} keysToDelete An array of keys left to delete.
   * @param {number} startLine The line to start updating.
   * @return {Array.<string>} An array of keys left to delete.
   */
  function domAndRepSpliceToTable(lineEntries, keysToDelete, startLine) {
    // the oldline needs to be a table line
    var oldLine = document.getElementById(keysToDelete[0]);
    var newLine = lineEntries[0].domInfo.node;

    // the .length check here is because IE empty domline divs dont have <br/>
    // inside them as opposed to webkit/firefox.
    var oldFirstChildIsTable = oldLine.children.length &&
        hasClass(oldLine.children[0], 'table');
    var newFirstChildIsTable = newLine.children.length &&
        hasClass(newLine.children[0], 'table');

    if (oldFirstChildIsTable && newFirstChildIsTable) {
      keysToDelete = [];
      newLine.parentNode.removeChild(newLine);
      oldLine.id = newLine.id;
      oldLine.className = newLine.className;

      var rep = editor.getRep();
      var opIter = Changeset.opIterator(rep.alines[startLine]);
      var node = oldLine.children[0].children[0].children[0].children[0];

      _updateTableData(node, opIter);

      var htmlTable = node.onAfterEdit();
      ensureShadowTableForTableNode(node, htmlTable);
      editor.markNodeClean(oldLine);
    }

    return keysToDelete;
  }

  /**
   * This creates a shadow, hidden table of the table found inside the <iframe>
   * such that copying still works.
   * @param {Element} node The parent container of the table.
   * @param {Element} table The actual table node.
   */
  function ensureShadowTableForTableNode(node, table) {
    var shadowTable = node.nextSibling;
    if (shadowTable) {
      node.parentNode.removeChild(shadowTable);
    }

    var cloned = table.cloneNode(true);
    var shadowTableContainer = document.createElement("div");
    addClass(shadowTableContainer, 'shadow-table');
    shadowTableContainer.appendChild(cloned);
    node.parentNode.appendChild(shadowTableContainer);
  }

  /**
   * Updates the table data through attributes.
   * @param {Element} node .
   * @param {Object} opIter Iterator to cycle through attributes.
   */
  function _updateTableData(node, opIter) {
    var attribsToSet = [];

    while (opIter.hasNext()) {
      var o = opIter.next();
      Changeset.eachAttribNumber(o.attribs, function(n) {
        var rep = editor.getRep();
        var key = rep.apool.getAttribKey(n).split(":");
        var value = rep.apool.getAttribValue(n);
        var row = key[0];
        var col = key[1];
        if (key.length == 2) {
          // cell value
          node.setDataAtCell(row, col, value);
        }

        if (key.length == 3) {
          var attrib = key[2];
          // cell attrib
          attribsToSet.push([row, col, attrib]);
        }
      });
    }

    for (var i = 0; i < attribsToSet.length; i++) {
      node.setAttribAtCell(attribsToSet[i][0], attribsToSet[i][1],
          attribsToSet[i][2]);
    }
  }

  /**
   * Fill a table at the given node.
   * @param {Element} node .
   */
  window.fillTable = function(node) {
    var n = {
      // TODO: This is nuts.
      node: node.parentNode.parentNode.parentNode.parentNode,
      index: 0,
      maxIndex: 0
    };

    if (!editor.isNodeDirty(n.node)) {
      var rep = editor.getRep();
      // detect if we're in a copy-paste situation
      var lineAndChar = editor.getLineAndCharForPoint(n);
      var opIter = Changeset.opIterator(rep.alines[lineAndChar[0]]);

      _updateTableData(node, opIter);

      var htmlTable = node.onAfterEdit();
      ensureShadowTableForTableNode(node, htmlTable);
      editor.markNodeClean(n.node);
    } else {
      console.log(n.node);
    }
  };

  /**
   * Delete a table at the given node.
   * @param {Element} node .
   */
  window.deleteTable = function(node) {
    var n = { node: node, index: 0, maxIndex: 0 };
    var lineAndChar = editor.getLineAndCharForPoint(n);
    var lineAndCharAfter = [lineAndChar[0], lineAndChar[1] + 1];

    editor.inCallStack("deleteTable", function() {
      editor.performDocumentReplaceRange(lineAndChar, lineAndCharAfter, '');
    });
  };

  // Public methods.
  return {
    domAndRepSpliceToTable: domAndRepSpliceToTable
  };
};
