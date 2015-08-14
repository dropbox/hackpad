import("fastJSON");

jimport("net.appjet.common.util.BetterFile")

jimport("java.lang.System.out.println");
jimport("javax.naming.directory.DirContext");
jimport("javax.naming.directory.SearchControls");
jimport("javax.naming.directory.InitialDirContext");
jimport("javax.naming.directory.SearchResult");
jimport("javax.naming.NamingEnumeration");
jimport("javax.naming.Context");
jimport("java.util.Hashtable");

function LDAP(config, errortext) {
  if(!config)
    this.error = errortext;
  else
    this.error = false;

  this.ldapConfig = config;
}

function _dmesg(m) {
  // if (!isProduction()) {
    println(new String(m));
  // }
}

/**
 * an ldap result object
 *
 * will either have error = true, with a corrisponding error message,
 * or will have error = false, with a corrisponding results object message
 */
function LDAPResult(msg, error, ldap) {
  if(!ldap) ldap = getLDAP();
  if(!error) error = false;
  this.message = msg;
  this.ldap = ldap;
  this.error = error;
}

/** 
 * returns the full name attribute, as specified by the 'nameAttribute' config
 * value.
 */
LDAPResult.prototype.getFullName = function() {
  return this.message[this.ldap.ldapConfig['nameAttribute']][0];
}

/**
 * Handy function for creating an LDAPResult object
 */
function ldapMessage(success, msg) {
  var message = msg;
  if(typeof(msg) == String) {
  message =  "LDAP " + 
             (success ? "Success" : "Error") + ": " + msg;
  }
  
  var result = new LDAPResult(message);
  result.error = !success;
  return result;
}

// returns the associated ldap results object, with an error flag of false
var ldapSuccess = 
  function(msg) { return ldapMessage.apply(this, [true,  msg]); };

// returns a helpful error message
var ldapError = 
  function(msg) { return ldapMessage.apply(this, [false, msg]); };

/* build an LDAP Query (searches for an objectClass and uid) */
LDAP.prototype.buildLDAPQuery = function(queryUser) {
  if(queryUser && queryUser.match(/[\w_-]+/)) {
    return "(&(objectClass=" +
            this.ldapConfig['userClass'] + ")(uid=" +
            queryUser + "))"
  } else return null;
}

LDAP.prototype.login = function(queryUser, queryPass) {
    var query = this.buildLDAPQuery(queryUser);
    if(!query) { return ldapError("invalid LDAP username"); }
    
    try {
        var context = LDAP.authenticate(this.ldapConfig['url'], 
                                        this.ldapConfig['principal'],
                                        this.ldapConfig['password']);
                                   
        if(!context) {
          return ldapError("could not authenticate principle user.");
        }

        var ctrl = new SearchControls();
        ctrl.setSearchScope(SearchControls.SUBTREE_SCOPE);
        var results = context.search(this.ldapConfig['rootPath'], query, ctrl);
        
        // if the user is found
        if(results.hasMore()) {
          var result = results.next();
          
          // grab the absolute path to the user
          var userResult = result.getNameInNamespace();
          var authed = !!LDAP.authenticate(this.ldapConfig['url'],
                                           userResult,
                                           queryPass)
          
          // return the LDAP info on the user upon success
          return authed ? 
            ldapSuccess(LDAP.parse(result)) : 
            ldapError("Incorrect password. Please try again.");
        } else {
          return ldapError("User "+queryUser+" not found in LDAP.");
        }
    
    // if there are errors in the search, log them and return "unknown error"
    } catch (e) {
        _dmesg(e);
        return ldapError(new String(e))
    }
};

LDAP.prototype.isLDAPSuffix = function(email) {
  return email.indexOf(this.ldapConfig['ldapSuffix']) == 
         (email.length-this.ldapConfig['ldapSuffix'].length);
}

LDAP.prototype.getLDAPSuffix = function() {
  return this.ldapConfig['ldapSuffix'];
}

/* static function returns a DirContext, or undefined upon authentation err */
LDAP.authenticate = function(url, user, pass) {
  var context = null;
  try {
    var env = new Hashtable();
    env.put(Context.INITIAL_CONTEXT_FACTORY,
      "com.sun.jndi.ldap.LdapCtxFactory");
    env.put( Context.SECURITY_PRINCIPAL, user );
    env.put( Context.SECURITY_CREDENTIALS, pass );
    env.put(Context.PROVIDER_URL, url);
    context = new InitialDirContext(env);      
  } catch (e) {
    // bind failed.
  }
  return context;
}

/* turn a res */
LDAP.parse = function(result) {
    var resultobj = {};
    try {
      var attrs = result.getAttributes();
      var ids = attrs.getIDs();
    
      while(ids.hasMore()) {
        var id = ids.next().toString();
        resultobj[id] = [];
      
        var attr = attrs.get(id);
      
        for(var i=0; i<attr.size(); i++) {
          resultobj[id].push(attr.get(i).toString());
        }
      }
    } catch (e) {
      // naming error
      return {'keys': e}
    }

    return resultobj;
}

LDAP.ldapSingleton = false;

// load in ldap configuration from a file...
function readLdapConfig(file) {
  var fileContents = BetterFile.getFileContents(file);

  if(fileContents == null)
    return "File not found.";

  var configObject = fastJSON.parse(fileContents);
  if(configObject['ldapSuffix']) {
    LDAP.ldapSuffix = configObject['ldapSuffix'];
  }
  return configObject;
}

// Sample Configuration file:
// {
//   "userClass"    : "person",
//   "url"          : "ldap://localhost:10389",
//   "principal"    : "uid=admin,ou=system",
//   "password"     : "secret",
//   "rootPath"     : "ou=users,ou=system",
//   "nameAttribute": "displayname",
//   "ldapSuffix"   : "@ldap"
// }

// appjet.config['etherpad.useLdapConfiguration'] = "/Users/kroo/Documents/Projects/active/AppJet/ldapConfig.json";
function getLDAP() {
  if (!  LDAP.ldapSingleton &&
      appjet.config['etherpad.useLdapConfiguration']) {
    var config = readLdapConfig(appjet.config['etherpad.useLdapConfiguration']);
    var error = null;
    if(!config) {
      config = null;
      error = "Error reading LDAP configuration file."
    }
    LDAP.ldapSingleton = new LDAP(config, error);
  }
  
  return LDAP.ldapSingleton;
}