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

// appjetContext.cache_requestCache()._t_start = (new Date()).valueOf();
var _appjethidden_ = {};
var serverhandlers = { tasks: {} };

/*
 * @overview
 *
 * AppJet standard library preamble.
 *
 * This is run at the beginning of every request, right after all
 * native calls are loaded into appjetContext.  This file is run
 * in the same scope as the app, the global scope, which is also
 * accessible from all modules.
 */

//----------------------------------------------------------------
// delete pesky rhino built-in string stuff
//----------------------------------------------------------------
(function() {
  // rhino strings come with a bunch of random "html helpers"
  // that we don't want
  var htmlStuff = ["bold", "italics", "fixed", "strike",
    "small", "big", "sub", "fontsize", "fontcolor", "link",
    "anchor", "sup", "blink"];
  for(var i in htmlStuff) {
    delete String.prototype[htmlStuff[i]];
  }
})();

//----------------------------------------------------------------
// module implementation
//----------------------------------------------------------------

(function(globalScope) {

   //----------------------------------------------------------------
   // Utility Functions
   //----------------------------------------------------------------   
   function appjetContext() {
     return net.appjet.oui.ExecutionContextUtils.currentContext();
   }
   function internalError(m) {
     throw new Error("AppJet Internal Error: "+m);
   }
   function apiError(m) {
     throw new Error("AppJet API Error: "+m);
   }
   function newScope() {
     var o = new Object();
     o.__parent__ = null;
     o.__proto__ = globalScope;
     return o;
   }
   _appjethidden_._debugMessage = function(m) {
     //java.lang.System.out.println(m);
   };
   var debug = _appjethidden_._debugMessage;
   function copySymbol(srcName, symName, src, dst, dstSymName) {
     if (!src.hasOwnProperty(symName)) {
       apiError("Import error: module \""+srcName+"\" does not contain the symbol \""+symName+"\".");
     }
     if (symName.charAt(0) == '_' && symName != '_') {
       apiError("Import error: cannot import symbol \""+symName+"\" because it is private (begins with _)");
     }
     debug("  | copying symbol ["+symName+"]");
     dst[dstSymName || symName] = src[symName];
   }
   function copyPublicSymbols(src, dst) {
     for (k in src) {
       if (src.hasOwnProperty(k) && (k.length > 0) && (k.charAt(0) != '_' || k == '_')) {
         copySymbol('', k, src, dst);
       }
     }
   }
   
   // Module import cache... hidden from other scopes.
   var moduleObjects = {};
   var modulesBeingLoaded = {};

   /*--------------------------------------------------------------------------------
    * loadModule():
    *   Evaluates moduleName in its own private scope, then copies its public identifiers
    *   into a new scope.  This new scope is stored in moduleObjects[moduleName] for future use
    *   by import()s.
    *
    *   If moduleName is currently being loaded (because we are in the middle of another loadModule()
    *   higher in the call stack), then this function does noething, on the assumption
    *   that moduleName will eventually be loaded anyway.  Therefore, it cannot be assumed that
    *   moduleName is done being loaded when loadModule() returns, only that it eventually will be
    *   loaded when all loadModule calls return up the call stack.
    *--------------------------------------------------------------------------------*/
   function loadModule(moduleName) {
     if (modulesBeingLoaded[moduleName]) {
       // This is OK.  The module will be loaded eventually.
       return;
     }
     if (moduleObjects[moduleName]) {
       return;
     }
     modulesBeingLoaded[moduleName] = true;
     try {
       debug("loadModule: "+moduleName);

       var modulePrivateScope = 
         Packages.net.appjet.ajstdlib.ajstdlib.runModuleInNewScope(
            appjetContext(), moduleName.split('.').join('/'));

       if (!modulePrivateScope) {
         // moduleName is not a module.  This is normal, because when someone calls
         // import("foo.bar"), we dont know if bar is a module or an identifier in the foo module.
         delete modulesBeingLoaded[moduleName];
         return;
       }
       // Thinking this could be useful:
       // modulePrivateScope['__MODULE_NAME__'] = moduleName;
       var moduleObj = newScope();
       copyPublicSymbols(modulePrivateScope, moduleObj);
       moduleObjects[moduleName] = moduleObj;
     } finally {
       delete modulesBeingLoaded[moduleName];
     }
   }

   /*--------------------------------------------------------------------------------
    * importSingleModule():
    *
    *   Takes a single moduleName (like "etherpad.foo.bar.baz") and creates the identifier "baz"
    *   in dstScope, referencing the module etherpad.foo.bar.baz.
    *
    *   This function is called one or more times by importPath().  Note that importPath() is more like
    *   the import() function that modules ses.
    *--------------------------------------------------------------------------------*/ 
   function importSingleModule(moduleName, dstScope) {
     debug("importSingleModule: "+moduleName);
     if (typeof(moduleName) != 'string') {
       apiError("modules should be referred to with string, not "+typeof(moduleName));
     }

     var moduleObj = moduleObjects[moduleName]; // public module scope
     if (!moduleObj) {
       return false;
     }
     
     var importedName = moduleName;
     if (importedName.indexOf(".") != -1) {
       importedName = importedName.split(".").slice(-1)[0];
     }
     dstScope[importedName] = moduleObj;
     return true;
   }

   /*--------------------------------------------------------------------------------
    * importPath():
    *   takes a modulePath (like "a.b.c.{d,e,f}" or "a.b.*" or just "a.b" or "a") and
    *   repeatedly calls importSingleModule() as necessary, copying public symbols into dst.
    *--------------------------------------------------------------------------------*/ 
   function importPath(modulePath, dst) {
     debug("importPath: "+modulePath);
     
     // Two possibilties:
     //   1. import the exact module and that's it.
     // 
     //   2. module contains a "." and we need to import up to the
     //      last ., and then import a name (or set of names) from it.
     
     // first try case 1:
     var ok = importSingleModule(modulePath, dst);
     if (ok) {
       return;
     }

     if (modulePath.indexOf(".") == -1) {
       throw new Error("Module does not exist: "+modulePath);
     }

     // now try case 2:
     var tempDst = newScope();
     var moduleName = modulePath.split('.').slice(0, -1).join('.');
     var importedName = modulePath.split('.').slice(-1)[0];
     var lastName = modulePath.split('.').slice(-2, -1)[0];

     ok = importSingleModule(moduleName, tempDst);
     if (!ok) {
       throw new Error("Neither module exists: "+moduleName+", "+modulePath);
     }

     if (!tempDst[lastName]) {
       internalError("import failed for "+moduleName+"|"+importedName+". This could be an appjet bug.");
     }
     if (importedName == "*") {
       copyPublicSymbols(tempDst[lastName], dst);
     } else if (importedName.match(/^\{.*\}$/)) {
       importedName.slice(1,-1).split(',').forEach(function(sym) {
         if (sym.match(/^.*=>.*$/)) {
           copySymbol(moduleName, sym.split("=>")[0], tempDst[lastName], dst, sym.split("=>")[1]);
         } else {
           copySymbol(moduleName, sym, tempDst[lastName], dst);
         }
       });
     } else {
       copySymbol(moduleName, importedName, tempDst[lastName], dst);
     }
   }

   //----------------------------------------------------------------
   // scheduling
   //----------------------------------------------------------------

   var scheduledImports = [];

   function scheduleImportPath(p, dst) {
     scheduledImports.push([p, dst]);
   }

   function runScheduledImports() {
     scheduledImports.forEach(function(x) {
       importPath(x[0], x[1]);
     });
     scheduledImports = [];
     modulesBeingLoaded = {};
   }

   //----------------------------------------------------------------
   // The global import function
   //----------------------------------------------------------------

   _appjethidden_.importsAllowed = true;

   globalScope['import'] = function(path1, path2, etc) {
     if (!_appjethidden_.importsAllowed) {
       throw Error("Imports are finished.  No more imports are allowed.");
     }

     var dstScope = this;
     if (arguments.length < 1) {
       apiError("importModule() takes the name of at least one module as an argument.");
     }
     for (var i = 0; i < arguments.length; i++) {
       var path = arguments[i];
       debug("scheduling import: "+path);
       scheduleImportPath(path, dstScope);
       // evaluate all modules in this path.
       var parts = path.split('.');
       for (var j = 0; j < parts.length; j++) {
         var moduleName = parts.slice(0,j+1).join('.');
         loadModule(moduleName);
       }
     }
   };

   // 'import' is a keyword on the client
   globalScope['server_side_import'] = globalScope['import'];

   _appjethidden_.finishImports = function() {
     debug("Running scheduled imports...");
     runScheduledImports();
     _appjethidden_.importsAllowed = false;
   };

   //----------------------------------------------------------------
   // jimport
   //----------------------------------------------------------------
   function _jimportSinglePackage(pname, dstScope) {
     //_appjethidden_._debugMessage("_jimportSinglePackage: "+pname);
     // TODO: support "*" and "{}" syntax like scala.
     var src = Packages;
     var srcParent = null;
     var localName = pname.split(".").pop();
     var soFar = '';

     pname.split(".").forEach(function(x) {
       soFar += x+'.';
       if (!src[x]) {
         throw ('Could not find java package/class: '+soFar);
       } else {
         //_appjethidden_._debugMessage("descenting into "+src+"["+x+"]");
         srcParent = src;
         src = src[x];
       }
     });

     if (String(src).indexOf('function') == 0) {
       // TODO: checking String(src).indexOf('function') is rather brittle.
       //       is there a cleaner way?
       // TODO: this only works on static functions... so make sure
       //       src[x] is a static function!
       dstScope[localName] = function() {
          return src.apply(srcParent, Array.prototype.slice.call(arguments));
       };
     } else {
       // importing a regular java class
       dstScope[localName] = src;
     }
   }

   /**
    * Import a java package over LiveConnect.
    */
   globalScope['jimport'] = function() {
     var dstScope = this;
     for (var i = 0; i < arguments.length; i++) {
       var pname = arguments[i].split(".").pop();
       _jimportSinglePackage(arguments[i], dstScope);
     }
   };

   //----------------------------------------------------------------
   // {appjet, request, response} imported by default
   //----------------------------------------------------------------
   globalScope['import'].call(globalScope, 
     "global.appjet.appjet", "global.request.request", "global.response.response");

})(this);

