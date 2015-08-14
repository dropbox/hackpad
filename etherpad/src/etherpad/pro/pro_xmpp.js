
import("etherpad.log");

jimport("org.jivesoftware.smack.ConnectionConfiguration");
jimport("org.jivesoftware.smack.XMPPConnection");

jimport("com.etherpad.SASLXFacebookPlatformMechanism");


function _initFacebookSasl() {
	SASLXFacebookPlatformMechanism.register();
	_initFacebookSasl = function() {};
}

function sendFacebookChatMessage(sessionKey, toFbId, msgTxt) {
	_initFacebookSasl();

	var config = new ConnectionConfiguration("chat.facebook.com", 5222);
	var conn = new XMPPConnection(config);

	try {
		conn.connect();
		conn.login(appjet.config.facebookClientId + "|" + appjet.config.facebookClientSecret, sessionKey, "Hackpad");

		var mgr = conn.getChatManager();
		var chat = mgr.createChat("-" + toFbId + "@chat.facebook.com", null);

		chat.sendMessage(msgTxt);
	} finally {
		conn.disconnect();
	}
}

