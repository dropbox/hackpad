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

import("fastJSON");
import("funhtml.*");
import("stringutils.toHTML");

import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.helpers.*");
import("etherpad.log");
import("etherpad.utils.*");

import("etherpad.control.pro_signup_control");
import("etherpad.control.pro.pro_main_control");
import("etherpad.pro.domains");
import("etherpad.pro.pro_account_auto_signin");
import("etherpad.pro.google_account");
import("etherpad.sessions");

import("etherpad.pad.model");
import("etherpad.collab.collab_server");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_pad_db");
jimport("org.apache.commons.lang.StringEscapeUtils.escapeHtml");

//----------------------------------------------------------------

function render_main_get() {
  if (request.path == '/ep/') {
    response.redirect('/');
  }

  if (!domains.getRequestDomainRecord()) {
    return pro_signup_control.render_main_get();
  }

  if (!pro_accounts.getSessionProAccount()) {
    pro_account_auto_signin.checkAutoSignin("/");
    // if we're signed in elsewhere, help us pick an account
    var otherAccts = pro_accounts.getCookieSignedInAccounts();
    if (otherAccts.length  && !domains.isPublicDomain()) {
      response.redirect('/ep/account/sign-in');
    }

  }

  if (domains.isPublicDomain() || pro_accounts.getSessionProAccount() || request.domain.indexOf("public.")==0) {
    return pro_main_control.render_main_get();
  }

  // skip the splashpage for domain accounts
  if (!domains.isPrimaryDomainRequest()) {
    if (request.params.inviteToken) {
      response.redirect("/ep/account/sign-in?inviteToken=" + request.params.inviteToken);
    } else {
      response.redirect("/ep/account/sign-in");
    }
  }

  addClientVars({
    facebookClientId: appjet.config.facebookClientId
  });

  var publicPads = [];

  addClientVars({
    shouldGetFbLoginStatus: pro_account_auto_signin.shouldAttemptFacebookAutoSignin(),
    useFbChat: appjet.config['etherpad.inviteFacebookChat'] == 'true'
  });

  var homepageVersion = 3;

  addClientVars({
    experiment:'homepage-v'+homepageVersion
  });

  renderHtml('main/home.ejs', {
    publicPads: publicPads,
    googleSignInUrl: google_account.googleOAuth2URLForLogin(),
    isSubDomain: !domains.isPrimaryDomainRequest(),

  });

  return true;
}

function render_support_get() {
  renderFramed("main/support_body.ejs");
  return true;
}

