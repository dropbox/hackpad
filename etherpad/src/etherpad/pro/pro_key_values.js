import("jsutils");
import("sqlbase.sqlobj");

function updateValueForAccounts(accountIds, key, value) {
  for (var i=0; i<accountIds.length; i++) {
    if (typeof(value) == "string") {
      sqlobj.insertOrUpdate('pro_account_key_values', {userId: accountIds[i] , key: key, stringValue: value});
    } else if (value instanceof  Date) {
      sqlobj.insertOrUpdate('pro_account_key_values', {userId: accountIds[i] , key: key, dateValue: value});
    } else if (typeof(value) == "number") {
      sqlobj.insertOrUpdate('pro_account_key_values', {userId: accountIds[i] , key: key, intValue: value});
    } else if (typeof(value) == "boolean") {
      sqlobj.insertOrUpdate('pro_account_key_values', {userId: accountIds[i] , key: key, intValue: value ? 1 : 0});
    }
  }
}

function valueFromRow(row) {
  if (row.stringValue != null) {
    return row.stringValue;
  } else if (row.intValue != null) {
    return row.intValue;
  } else if (row.dateValue != null) {
    return row.dateValue;
  }
}

function decorateWithValues(accounts, key) {
  var userIds = accounts.map(function(acct){return acct.id});
  var valueRows = sqlobj.selectMulti('pro_account_key_values',
    {key: key, userId: ['IN', userIds]});
  var accountsById = jsutils.dictByProperty(accounts, 'id');
  for (var i=0; i<valueRows.length; i++) {
    accountsById[valueRows[i].userId][key] = valueFromRow(valueRows[i]);
  }
}

