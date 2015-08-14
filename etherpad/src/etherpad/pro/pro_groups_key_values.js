import("jsutils");
import("fastJSON");
import("sqlbase.sqlobj");
import("etherpad.log");

function updateValueForGroup(groupId, key, value) {
  var valueJSON = fastJSON.stringify(value);
  sqlobj.insertOrUpdate('pro_groups_key_values', {
    groupId: groupId, 
    key: key,
    lastUpdatedDate: new Date(),
    jsonVal: valueJSON
  });
}

function decorateWithValues(groups, key) {
  var groupIds = groups.map(function(group) {
    return group.groupId;
  });

  var rows = sqlobj.selectMulti('pro_groups_key_values', {
    groupId: ['in', groupIds], 
    key: key
  });

  var rowsMapByGroupId = jsutils.dictByProperty(rows, 'groupId');
  groups.forEach(function(group) {
    var valueJSON = "{}";
    var row = rowsMapByGroupId[group.groupId];
    if(row) {
      valueJSON = row.jsonVal;
    }
    group[key] = fastJSON.parse(valueJSON);
  })
}

function getValueForGroup(groupId, key) {
  var row = sqlobj.selectSingle('pro_groups_key_values', {
    groupId: groupId,
    key: key
  });

  var value;
  if (row && row.jsonVal) {
    value = fastJSON.parse(row.jsonVal);
  } 

  return value;
}