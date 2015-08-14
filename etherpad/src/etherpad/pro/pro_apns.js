
jimport("com.notnoop.apns.APNS");

import("execution");
import("jsutils.*");
import("fastJSON");
import("sqlbase.sqlcommon.inTransaction");
import("stringutils.trim");

import("etherpad.log");
import("etherpad.pad.padutils");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_tokens");
import("etherpad.pro.pro_padmeta");

var APP_STORE_APP_ID = 'com.hackpad.Hackpad';
var BETA_APP_ID = APP_STORE_APP_ID + '.beta';
var DEBUG_APP_ID = APP_STORE_APP_ID + '.debug';

function onStartup() {
  if (appjet.config.devMode) {
    log.info('Not scheduling APNS feedback processing in developer mode.');
    return;
  }
  if (appjet.config.disableApns == "true") {
    log.info('APNS feedback processing disabled.');
    return;
  }
  execution.initTaskThreadPool("apns-feedback", 1);
  _scheduleNextDailyFeedbackProcessor();
}

serverhandlers.tasks.processAPNSFeedback = function () {
  try {
    processFeedback();
  } catch (ex) {
    log.warn('processAPNSFeedback failed: ' + ex.toString());
  } finally {
    _scheduleNextDailyFeedbackProcessor();
  }
}

function _scheduleNextDailyFeedbackProcessor() {
  var now = +(new Date);
  var tomorrow = new Date(now + 1000*60*60*24);
  tomorrow.setHours(2);
  tomorrow.setMinutes(22);
  tomorrow.setMilliseconds(222);
  log.info("Scheduling next daily APNS feedback update for: " + tomorrow.toString());
  var delay = +tomorrow - now;
  execution.scheduleTask("apns-feedback", "processAPNSFeedback", delay, []);
}

function _serviceForAppId(appId) {
  if (!appjet.cache.apnsService) {
    appjet.cache.apnsService = {};
  }
  if (appjet.cache.apnsService[appId]) {
    return appjet.cache.apnsService[appId];
  }
  var configPrefix = 'apnsCert.';
  switch (appId) {
    case APP_STORE_APP_ID: configPrefix += 'appStore'; break;
    case BETA_APP_ID:      configPrefix += 'beta';     break;
    case DEBUG_APP_ID:     configPrefix += 'debug';    break;
  }
  log.info('Loading ' + appId + ' APNS config');
  var apnsBuilder = APNS.newService().withCert(appjet.config[configPrefix + '.certFile'],
                                               trim(appjet.config[configPrefix + '.certPass']));
  if (appId == DEBUG_APP_ID) {
    apnsBuilder = apnsBuilder.withSandboxDestination();
  } else {
    apnsBuilder = apnsBuilder.withProductionDestination();
  }
  return appjet.cache.apnsService[appId] = apnsBuilder.build();
}

function sendPushNotification(appId, deviceToken, message, customFields, optContentAvailable, optSound) {
  return;

  if (appjet.config.disableApns == "true") {
    return;
  }
  var payload = { aps: {} };
  if (message) {
    payload.aps.alert = message;
  }
  if (optContentAvailable) {
    payload.aps['content-available'] = 1;
    if (!message) {
      payload.aps.badge = 0;
    }
  }
  if (optSound) {
    payload.aps.sound = optSound;
  }

  if (customFields) {
    for (var k in customFields) {
      payload[k] = customFields[k];
    }
  }

  _serviceForAppId(appId).push(deviceToken, fastJSON.stringify(payload));
}

var APNS_HP_T_CREATE = 'c';
var APNS_HP_T_DELETE = 'd';
var APNS_HP_T_EDIT = 'e';
var APNS_HP_T_FOLLOW = 'f';
var APNS_HP_T_UNFOLLOW = 'u';
var APNS_HP_T_INVITE = 'i';
var APNS_HP_T_MENTION = 'm';

function sendPushNotificationForPad(globalPadId, msg, userId, eventType) {
  var sent = false;
  var tokens = pro_tokens.getIOSDeviceTokensForUser(userId);

  var padUrl = padutils.urlForGlobalPadId(globalPadId);
  var encryptedUserId = pro_accounts.getEncryptedUserId(userId);
  var lastEditedDate = pro_padmeta.accessProPad(globalPadId, function (ppad) {
      return ppad.getLastEditedDate();
    });
  lastEditedDate = lastEditedDate ? Math.floor((+lastEditedDate) / 1000) : 0;

  eachProperty(tokens, function (appId, deviceTokens) {
    if (!deviceTokens.length) {
      return;
    }
    sendPushNotification(appId, deviceTokens, msg, {
      hp: {
        u: padUrl,
        a: encryptedUserId,
        t: eventType,
        d: lastEditedDate
      }
    }, true);
    sent = true;
  })
  if (!sent && appjet.config.devMode) {
    log.info("No iOS device registered for account " + userId);
  }
  return sent;
}

function _processServiceFeedback(appId) {
  var service = _serviceForAppId(appId);
  var devices = service.getInactiveDevices();
  log.info('Processing ' + devices.size() + ' device tokens for ' + appId);
  if (!devices.size()) {
    return;
  }
  // .concat() to convert to JS array
  var deviceTokens = devices.keySet().toArray().concat();
  inTransaction(function () {
    pro_tokens.getIOSDeviceTokensForAppId(appId, deviceTokens).forEach(function (deviceToken) {
      var feedbackDate = new Date(devices.get(deviceToken.token));
      if (+feedbackDate > +deviceToken.expirationDate) {
        return;
      }
      log.info('Ignoring removal for ' + deviceToken.token + " since we've seen it recently");
      devices.remove(deviceToken.token.toUpperCase());
    });
    deviceTokens = devices.keySet().toArray().concat();
    log.info('Removing ' + deviceTokens.length + ' tokens.');
    if (!deviceTokens.length) {
      return;
    }
    pro_tokens.removeIOSDeviceTokensForAppId(appId, deviceTokens);
  });
}

function processFeedback() {
  return;
  if (!appjet.config.devMode) {
    _processServiceFeedback(APP_STORE_APP_ID);
    _processServiceFeedback(BETA_APP_ID);
  }
  _processServiceFeedback(DEBUG_APP_ID);
}
