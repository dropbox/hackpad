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

import("funhtml.*", "stringutils.*");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon");
import("stringutils");
import("email.sendEmail");

import("etherpad.utils.*");
import("etherpad.log");
import("etherpad.pro.pro_utils");
import("etherpad.sessions.{getSession,saveSession}");

jimport("java.lang.System.out.println");

function render_main_get() {
  if (isValveOpen()) {
    response.redirect("/ep/pro-signup/");
  }
  renderFramed("beta/signup.ejs", {
    errorMsg: getSession().betaSignupError
  });
  delete getSession().betaSignupError;
  saveSession();
}

function render_signup_post() {
  // record in sql: [id, email, activated=false, activationCode]
  // log to disk

  var email = request.params.email;
  if (!isValidEmail(email)) {
    getSession().betaSignupError = "Invalid email address.";
    saveSession();
    response.redirect('/ep/beta-account/');
  }

  // does email already exist?
  if (sqlobj.selectSingle('pro_beta_signups', {email: email})) {
    getSession().betaSignupError = "Email already signed up.";
    saveSession();
    response.redirect('/ep/beta-account/');
  }

  sqlobj.insert('pro_beta_signups', {
    email: email,
    isActivated: false,
    signupDate: new Date()
  });

  response.redirect('/ep/beta-account/signup-ok');
}

function render_signup_ok_get() {
  renderNoticeString(
    DIV({style: "font-size: 16pt; border: 1px solid green; background: #eeffee; margin: 2em 4em; padding: 1em;"},
      P("Great!  We'll be in touch."),
        P("In the meantime, you can ", A({href: '/ep/pad/newpad', style: 'text-decoration: underline;'},
          "create a public pad"), " right now.")));
}

// return string if not valid, falsy otherwise.
function isValidCode(code) {
  if (isValveOpen()) {
    return undefined;
  }

  function wr(m) {
    return DIV(P(m), P("You can sign up for the beta ",
            A({href: "/ep/beta-account/"}, "here")));
  }

  if (!code) {
    return wr("Invalid activation code.");
  }
  var record = sqlobj.selectSingle('pro_beta_signups', { activationCode: code });
  if (!record) {
    return wr("Invalid activation code.");
  }
  if (record.isActivated) {
    return wr("That activation code has already been used.");
  }
  return undefined;
}

function isValveOpen() {
  if (appjet.cache.proBetaValveIsOpen === undefined) {
    appjet.cache.proBetaValveIsOpen = true;
  }
  return appjet.cache.proBetaValveIsOpen;
}

function toggleValve() {
  appjet.cache.proBetaValveIsOpen = !appjet.cache.proBetaValveIsOpen;
}

function sendInvite(recordId) {
  var record = sqlobj.selectSingle('pro_beta_signups', {id: recordId});
  if (record.activationCode) {
    getSession().betaAdminMessage = "Already active";
    return;
  }

  // create activation code
  var code = stringutils.randomString(10);
  sqlcommon.inTransaction(function() {
    sqlobj.update('pro_beta_signups', {id: recordId}, {activationCode: code,
      invitationDate: new Date()});
    var body = renderTemplateAsString('email/pro_beta_invite.ejs', {
      toAddr: record.email,
      signupAgo: timeAgo(record.signupDate),
      signupCode: code,
      activationUrl: "http://"+httpHost(request.host)+"/ep/pro-signup/?sc="+code
    });
    sendEmail(record.email, pro_utils.getSupportEmailFromAddr(),
              "Your HackPad Pro Account", {'Reply-To': pro_utils.getSupportEmailFromAddr() },
              body);
  });

  getSession().betaAdminMessage = "Invite sent.";
  saveSession();
}

function sendInviteReminder(recordId) {
  var record = sqlobj.selectSingle('pro_beta_signups', {id: recordId});
  if (record.activationDate) {
    getSession().betaAdminMessage = "Already active";
    saveSession();
    return;
  }

  var body = renderTemplateAsString('email/pro_beta_invite_reminder.ejs', {
    toAddr: record.email,
    signupCode: record.activationCode,
    activationUrl: "http://"+httpHost(request.host)+"/ep/pro-signup/?sc="+record.activationCode
  });
  sendEmail(record.email, "The HackPad Team <foo@example.com>",
    "Reminder about your HackPad Pro invite", {'Reply-To': pro_utils.getSupportEmailFromAddr() },
    body);

  getSession().betaAdminMessage = "Invite reminders sent.";
  saveSession();
}

function notifyActivated(code) {
  println("updating: "+code);
  sqlobj.update('pro_beta_signups', {activationCode: code},
                {isActivated: true, activationDate: new Date()});
}

