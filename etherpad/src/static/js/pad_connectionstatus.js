/*!
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

var padconnectionstatus = (function() {

  var status = {what: 'connecting'};
  var reconnectTimer;

  var self = {
    init: function() {
      $('button#forcereconnect').click(function() {
        return pad.forceReconnect();
      });
      $('#connectionbox .dialog-cancel-x').on('click', function() {
        $('#modaloverlay').hide();
        $('#connectionbox').addClass('compact');
        $(".connection-status").hide();
      });
      $('#freakout-copy-first').on('click', function() {
        $('#modaloverlay').hide();
        $('#freakout-dialog').addClass('compact');
        $('#freakout-copy-first').hide();
        $(".connection-status").hide();
      });
    },
    connected: function() {
      self.clearReconnectTimer();

      status = {what: 'connected'};
      $('#connectionbox').removeClass('compact');
      $(".connection-status").hide();
    },
    reconnecting: function() {
      self.clearReconnectTimer();

      status = {what: 'reconnecting'};
      reconnectTimer = setTimeout(function() {
        $(".connection-status").show();
      }, 1500);

    },
    disconnected: function(msg) {
      self.clearReconnectTimer();

      status = {what: 'disconnected', why: msg};
      var k = String(msg).toLowerCase(); // known reason why
      if (!(k == 'userdup' || k == 'looping' || k == 'slowcommit' ||
            k == 'initsocketfail' || k == 'unauth')) {
        k = 'unknown';
      }
      var cls = 'modaldialog cboxdisconnected cboxdisconnected_'+k;
      $("#connectionbox").get(0).className = cls;

      padmodals.showModal("#connectionbox", 500, true);
    },
    isFullyConnected: function() {
      return status.what == 'connected';
    },
    getStatus: function() { return status; },
    clearReconnectTimer: function() {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };
  return self;
}());
