/// <reference path="../../../definitions/default.d.ts"/>
/// <reference path="../../../definitions/default.d.ts"/>
import("sqlbase.sqlobj");

function run() {
  sqlobj.dropTable('plugin');
  sqlobj.dropTable('hook_type');
  sqlobj.dropTable('hook');
  sqlobj.dropTable('plugin_hook');
}
