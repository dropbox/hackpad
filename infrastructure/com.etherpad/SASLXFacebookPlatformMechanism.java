package com.etherpad;

import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.Map;

import javax.security.auth.callback.CallbackHandler;
import javax.security.sasl.Sasl;
import org.jivesoftware.smack.SASLAuthentication;
import org.jivesoftware.smack.XMPPException;
import org.jivesoftware.smack.sasl.SASLMechanism;
import org.jivesoftware.smack.util.Base64;

public class SASLXFacebookPlatformMechanism extends SASLMechanism
{

    private static final String NAME              = "X-FACEBOOK-PLATFORM";

    private String              apiKey            = "";
    private String              applicationSecret = "";
    private String              sessionKey        = "";

    public static void register()
    {
        SASLAuthentication.registerSASLMechanism(NAME, SASLXFacebookPlatformMechanism.class);
        SASLAuthentication.supportSASLMechanism(NAME, 0);
    }

    /**
     * Constructor.
     */
    public SASLXFacebookPlatformMechanism(SASLAuthentication saslAuthentication)
    {
        super(saslAuthentication);
    }

    @Override
    protected void authenticate() throws IOException, XMPPException
    {

        getSASLAuthentication().send(new AuthMechanism(NAME, ""));
    }

    @Override
    public void authenticate(String apiKeyAndSecret, String host,
            String sessionKey) throws IOException, XMPPException
    {
        if (apiKeyAndSecret == null || sessionKey == null)
        {
            throw new IllegalArgumentException("Invalid parameters");
        }

        String[] keyArray = apiKeyAndSecret.split("\\|", 2);
        if (keyArray.length < 2)
        {
            throw new IllegalArgumentException(
                    "API key or session key is not present");
        }

        this.apiKey = keyArray[0];
        this.applicationSecret = keyArray[1];
        this.sessionKey = sessionKey;

        this.authenticationId = sessionKey;
        this.password = applicationSecret;
        this.hostname = host;

        String[] mechanisms = { NAME };
        Map<String, String> props = new HashMap<String, String>();
        this.sc = Sasl.createSaslClient(mechanisms, null, "xmpp", host, props, this);
        authenticate();
    }

    @Override
    protected String getName()
    {
        return NAME;
    }

    @Override
    public void challengeReceived(String challenge) throws IOException
    {
        byte[] response = null;

        if (challenge != null)
        {
            String decodedChallenge = new String(Base64.decode(challenge));
            Map<String, String> parameters = getQueryMap(decodedChallenge);

            String version = "1.0";
            String nonce = parameters.get("nonce");
            String method = parameters.get("method");

            long callId = new GregorianCalendar().getTimeInMillis();

            String sig =
                    "api_key=" + apiKey + "call_id=" + callId + "method="
                            + method + "nonce=" + nonce + "access_token="
                            + sessionKey + "v=" + version;

            try
            {
                sig = md5(sig);
            } catch (NoSuchAlgorithmException e)
            {
                throw new IllegalStateException(e);
            }

            String composedResponse =
                    "api_key=" + URLEncoder.encode(apiKey, "utf-8")
                            + "&call_id=" + callId + "&method="
                            + URLEncoder.encode(method, "utf-8") + "&nonce="
                            + URLEncoder.encode(nonce, "utf-8")
                            + "&access_token="
                            + URLEncoder.encode(sessionKey, "utf-8") + "&v="
                            + URLEncoder.encode(version, "utf-8") + "&sig="
                            + URLEncoder.encode(sig, "utf-8");

            response = composedResponse.getBytes("utf-8");
        }

        String authenticationText = "";

        if (response != null)
        {
            authenticationText =
                    Base64.encodeBytes(response, Base64.DONT_BREAK_LINES);
        }

        // Send the authentication to the server
        getSASLAuthentication().send(new Response(authenticationText));
    }

    private Map<String, String> getQueryMap(String query)
    {
        Map<String, String> map = new HashMap<String, String>();
        String[] params = query.split("\\&");

        for (String param : params)
        {
            String[] fields = param.split("=", 2);
            map.put(fields[0], (fields.length > 1 ? fields[1] : null));
        }

        return map;
    }

    private String md5(String text) throws NoSuchAlgorithmException,
            UnsupportedEncodingException
    {
        MessageDigest md = MessageDigest.getInstance("MD5");
        md.update(text.getBytes("utf-8"), 0, text.length());
        return convertToHex(md.digest());
    }

    private String convertToHex(byte[] data)
    {
        StringBuilder buf = new StringBuilder();
        int len = data.length;

        for (int i = 0; i < len; i++)
        {
            int halfByte = (data[i] >>> 4) & 0xF;
            int twoHalfs = 0;

            do
            {
                if (0 <= halfByte && halfByte <= 9)
                {
                    buf.append((char) ('0' + halfByte));
                }
                else
                {
                    buf.append((char) ('a' + halfByte - 10));
                }
                halfByte = data[i] & 0xF;
            } while (twoHalfs++ < 1);
        }

        return buf.toString();
    }
}

