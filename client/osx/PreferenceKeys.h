// Define all the keys used in the preferences
#define FIRST_RUN_KEY             @"firstRun"

// Define convenience methods for accessing the above keys
#define DEFAULTS [NSUserDefaults standardUserDefaults]

#define EncodeAndSaveObject(object,key) [DEFAULTS setObject:[NSKeyedArchiver archivedDataWithRootObject:object] forKey:key]
#define LoadAndDecodeObject(key) [DEFAULTS objectForKey:key] != nil ? [NSKeyedUnarchiver unarchiveObjectWithData:[DEFAULTS objectForKey:key]] : nil

#define FIRST_RUN             [DEFAULTS boolForKey:FIRST_RUN_KEY]



