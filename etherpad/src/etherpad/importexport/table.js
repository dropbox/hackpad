import("etherpad.collab.ace.easysync2.Changeset");
import("funhtml.*");


function renderStaticTable(aline, apool) {
  var tableData = [];

  var attributionIter = Changeset.opIterator(aline);
  var firstOp = attributionIter.next();
  var attribs = firstOp.attribs;
  var isTable = false;
  var cols = 0;
  var modifiedTableData = {};
  Changeset.eachAttribNumber(firstOp.attribs, function(n) {
    var key = apool.getAttribKey(n);
    if (key == "table") {
      isTable = true;
    }
    if (key && key.split(":").length == 2) {
      var value = apool.getAttribValue(n);
      var row = parseInt(key.split(":")[0]);
      var col = parseInt(key.split(":")[1]);
      if (col >= cols) {
        cols = col + 1;
      }
      // mark the modified values ("m" means modified)
      if (apool.attribToNum[[key,"m"].join(",")] != undefined) {
        modifiedTableData[key] = true;
        modifiedTableData[row] = true;
      }

      tableData[row] = tableData[row] || [];
      tableData[row][col] = value;
    }
  });

  if (!isTable) {
    return null;
  }

  // compress the table to only changed rows
  var trimmedTableData = [];
  var trimmedModifiedTableData = {};
  var tableIsAllNew = true;
  for (var i=0; i<tableData.length; i++) {
    if (modifiedTableData[i]) {
      trimmedTableData.push(tableData[i]);
      for (var j=0; j<tableData[i].length; j++) {
        if (modifiedTableData[[i,j].join(":")]) {
          var newRowId = trimmedTableData.length-1;
          trimmedModifiedTableData[[newRowId,j].join(":")] = true;
        }
      }
      tableIsAllNew = false;
    }
  }
  if (!tableIsAllNew) {
    // if all new, we don't trim
    tableData = trimmedTableData;
    modifiedTableData = trimmedModifiedTableData;
  }

  if (tableData.length) {
    var t = TABLE({style : 'font-size:13px;cell-spacing: 0px; border-collapse: collapse;'});
    for (var j=0; j<tableData.length; j++) {
      var tr = TR();

      if (tableData[j] && tableData[j].length) {
        for (var k=0; k<cols; k++) {
          var td = null;
          var attrs = {style:'border:1px solid #999; min-width: 50px;height: 22px;line-height: 16px;padding: 0 4px 0 4px;'};
          if (tableIsAllNew || modifiedTableData[[j,k].join(":")])  {
            attrs['class'] = "added";
          }

          if (tableData[j][k]) {
            td = TD(attrs, tableData[j][k]);
          } else {
            td = TD(attrs, "");
          }
          tr.push(td);

        }
      }
      t.push(tr);
    }

    return {"innerHTML": t, "className": "ace-line"};
  }
  return null;
}