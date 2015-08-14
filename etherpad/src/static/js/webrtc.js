function hackpadRTC() {
  // We only want to instantiate this once.
  if (hackpadRTC.instance) {
    return hackpadRTC.instance;
  }
  hackpadRTC.instance = this;

  var self = this;

  self.webrtc = new SimpleWebRTC({
    localVideoEl: 'local-video',
    remoteVideosEl: 'remote-videos',
    autoRequestMedia: false,
    detectSpeakingEvents: false,  // TODO: buggy :-/
    autoAdjustMic: false,
    debug: false,
    url: window.location.protocol + '//' + window.location.host,
    peerConnectionConfig: {   // TODO: configure.
      iceServers: [{"url": "stun:stun.l.google.com:19302"}]
    },
    media: {
      audio: true,
      video: {
        mandatory: {
          maxWidth: 133,
          maxHeight: 100
        }
       }
    }
  });


  // when it's ready, join if we got a room from the URL
  self.webrtc.on('readyToCall', function() {
    var currentSite = location.host.substring(0,
        location.host.indexOf(document.domain) - 1);
    if (currentSite) {
      self.webrtc.joinRoom(currentSite);
    }
  });


  self.webrtc.on('videoAdded', function(video, peer) {
    var videoEl = $(video);

    peer.reliableChannel.onmessage = function(event) {
      var msg = JSON.parse(event.data);
      msg.peerId = peer.id;
      self.webrtc.emit(msg.type, msg);
    };

    peer.reliableChannel.onopen = function() {
      peer.reliableChannel.send(JSON.stringify({
        type: 'setUsername',
        username: pad.getUserName(),
        color: clientVars.colorPalette[clientVars.userColor % clientVars.colorPalette.length]
      }));
    }

    videoEl.show();

    self.updateSize();
  });

  self.webrtc.on('setUsername', function(msg) {
    var videoEl = $('#' + msg.peerId + '_video_incoming');
    self.decorateWebRTCUsername(videoEl, msg.peerId,
        msg.username, msg.color);
  });


  self.webrtc.on('videoRemoved', function(videoEl, peer) {
    $('.webrtc-remote-' + peer.id).remove();
  });


  self.webrtc.on('speaking', function(opt_id) {
    if (opt_id) {
      $('#' + opt_id.id + '_video_incoming').addClass('speaking');
    } else {
      $('#local-video').addClass('speaking');
    }
  });


  self.webrtc.on('stoppedSpeaking', function() {
    $('#local-video').removeClass('speaking');
  });


  self.webrtc.on('stopped_speaking', function(id) {
    $('#' + id.id + '_video_incoming').removeClass('speaking');
  });
}
hackpadRTC.prototype = {
  webrtc: null,

  hexToRgb: function(hex) {
     var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
     return result ? {
         r: parseInt(result[1], 16),
         g: parseInt(result[2], 16),
         b: parseInt(result[3], 16)
     } : null;
  },

  decorateWebRTCUsername: function(videoEl, opt_id, opt_username, opt_color) {
    opt_id = opt_id || 'self';
    opt_username = opt_username || pad.getUserName();
    opt_color = opt_color || clientVars.colorPalette[clientVars.userColor % clientVars.colorPalette.length];

    if (videoEl.prev().is('figcaption')) {
      videoEl.prev().remove();
    }

    var rgb = this.hexToRgb(opt_color);

    $('<figcaption>').
        addClass('webrtc-username').
        addClass('webrtc-remote-' + opt_id).
        text(opt_username).
        css('background-color', opt_color).
        css('color', 'rgba(' +
            Math.max(rgb.r - 50, 0) + ', ' +
            Math.max(rgb.g - 50, 0) + ', ' +
            Math.max(rgb.b - 50, 0) + ')').
        insertBefore(videoEl);
    this.updateSize();
  },

  updateSize: function() {
    var videos = $('#webrtc video');
    var regularVideoHeight = 100;
    var smallVideoHeight = 75;
    var tinyVideoHeight = 60;
    var height = videos.length < 4 ? regularVideoHeight :
        (videos.length < 6 ? smallVideoHeight : tinyVideoHeight);
    $('#webrtc video').
        height(height).width(height * 1.333);
    $('#webrtc .webrtc-username').
        width(height * 1.333 - 10 /* padding on username */);
  },

  start: function() {
    hackpadRTC.broadcasting = true;
    this.webrtc.startLocalVideo();
  },

  stop: function(enable) {
    hackpadRTC.broadcasting = false;
    this.webrtc.stopLocalVideo();
    this.webrtc.leaveRoom();
  }
};

// @type {hackpadRTC} Static reference to WebRTC session.
hackpadRTC.instance = null;

// @type {boolean} Static boolean to know whether we're broadcasting or not.
hackpadRTC.broadcasting = false;

var webrtcCheckOtherTabFocusInterval;
var webrtcThisInstanceStartTime;
function startWebrtc() {
  if (hackpadRTC.broadcasting) {
    return;
  }

  if (!pad.initTime) {
    setTimeout(startWebrtc, 100);
    return;
  }

  // Kick off new instance, creates websocket connection to start signalling.
  new hackpadRTC();

  $('#enable-video').text('Stop Video');
  localStorage['webrtc_start_time'] = webrtcThisInstanceStartTime = new Date();
  hackpadRTC.instance.start();

  hackpadRTC.instance.decorateWebRTCUsername($('#local-video'));
  $('#webrtc').show();

  webrtcCheckOtherTabFocusInterval = window.setInterval(function() {
    if (localStorage['webrtc_start_time'] != webrtcThisInstanceStartTime) {
      stopWebrtc();
    }
  }, 100);
}

function stopWebrtc() {
  window.clearInterval(webrtcCheckOtherTabFocusInterval);
  webrtcThisInstanceStartTime = null;
  hackpadRTC.instance.stop();
  $('#webrtc').hide();
  $('#enable-video').text('Live Video');
}

$('#enable-video').on('click', function() {
  if (hackpadRTC.broadcasting) {
    localStorage['webrtc'] = false;
    stopWebrtc();
    return;
  }

  localStorage['webrtc'] = true;
  startWebrtc();
});

var hidden, visibilityChange; 
if (typeof document.hidden !== "undefined") {
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
  hidden = "mozHidden";
  visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}

function handleVisibilityChange() {
  if (!document[hidden] && localStorage['webrtc'] == 'true') {
    startWebrtc();
  }
}

if (typeof document.addEventListener !== "undefined" &&
  typeof hidden !== "undefined") {
  // Handle page visibility change   
  document.addEventListener(visibilityChange, handleVisibilityChange, false);
}

$(function() {
  if (localStorage['webrtc'] == 'true') {
    startWebrtc();
  }
});
