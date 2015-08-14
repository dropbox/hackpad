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

import("funhtml");
import("funhtml.*");
import("jsutils.cmp");
import("jsutils.eachProperty");
import("exceptionutils");
import("execution");
import("stringutils.trim");

import("etherpad.sessions.{getSession,saveSession}");
import("etherpad.utils.*");
import("etherpad.helpers");

function _splitCommand(cmd) {
  var parts = [[], []];
  var importing = true;
  cmd.split("\n").forEach(function(l) {
    if ((trim(l).length > 0) &&
        (trim(l).indexOf("import") != 0)) {
      importing = false;
    }

    if (importing) {
      parts[0].push(l);
    } else {
      parts[1].push(l);
    }
  });

  parts[0] = parts[0].join("\n");
  parts[1] = parts[1].join("\n");
  return parts;
}

function getResult(cmd) {
  var resultString = (function() {
    try {
      var parts = _splitCommand(cmd);
      result = execution.fancyAssEval(parts[0], parts[1]);
    } catch (e) {
      // if (e instanceof JavaException) {
      //   e = new net.appjet.bodylock.JSRuntimeException(e.getMessage(), e.javaException);
      // }
      if (appjet.config.devMode) {
        (e.javaException || e.rhinoException || e).printStackTrace();
      }
      result = exceptionutils.getStackTracePlain(e);
    }
    var resultString;
    try {
      resultString = ((result && result.toString) ? result.toString() : String(result));
    } catch (ex) {
      resultString = "Error converting result to string: "+ex.toString();
    }
    return resultString;
  })();
  return resultString;
}

function _renderCommandShell() {
  // run command if necessary
  if (request.params.cmd) {
    var cmd = request.params.cmd;
    var resultString = getResult(cmd);

    getSession().shellCommand = cmd;
    getSession().shellResult = resultString;
    saveSession();
    response.redirect(request.path+(request.query?'?'+request.query:''));
  }

  var div = DIV({style: "padding: 4px; margin: 4px; background: #eee; "
                        + "border: 1px solid #338"});
  // command div
  var oldCmd = getSession().shellCommand || "";
  var commandDiv = DIV({style: "width: 100%; margin: 4px 0;"});
  commandDiv.push(FORM({style: "width: 100%;",
                        method: "POST", action: request.path + (request.query?'?'+request.query:'')},
    INPUT({type: "hidden", name: "xsrf", value:helpers.xsrfToken()}),
    TEXTAREA({name: "cmd",
              style: "border: 1px solid #555;"
                     + "width: 100%; height: 160px; font-family: monospace;"},
             html(oldCmd)),
    INPUT({type: "submit"})));

  // result div
  var resultDiv = DIV({style: ""});
  var isResult = getSession().shellResult != null;
  if (isResult) {
    resultDiv.push(DIV(
      PRE({style: 'border: 1px solid #555; font-family: monospace; margin: 4px 0; padding: 4px;'},
          getSession().shellResult)));
    delete getSession().shellResult;
    saveSession();
    resultDiv.push(DIV({style: "text-align: right;"},
                       A({href: qpath({})}, "clear")));
  } else {
    resultDiv.push(P("result will go here"));
  }

  var t = TABLE({border: 0, cellspacing: 0, cellpadding: 0, width: "100%",
                style: "width: 100%;"});
  t.push(TR(TH({width: "49%", align: "left"}, "   Command:"),
            TH({width: "49%", align: "left"}, "   "+(isResult ? "Result:" : ""))),
         TR(TD({valign: "top", style: 'padding: 4px;'}, commandDiv),
            TD({valign: "top", style: 'padding: 4px;'}, resultDiv)));
  div.push(t);
  return div;
}


function render_main_post() {
  // run command if necessary
  if (request.params.cmd) {
    var cmd = request.params.cmd;
    var resultString = getResult(cmd);

    getSession().shellCommand = cmd;
    getSession().shellResult = resultString;
    response.redirect(request.path+(request.query ? '?' + request.query : ''));
  }
}


function render_main_get() {
   var body = funhtml.DIV();
   body.push(_renderCommandShell());
   renderHtml("admin/dynamic.ejs", {
    config: appjet.config,
    bodyClass: 'nonpropad',
    title: 'Shell',
    content: body
   });
}
