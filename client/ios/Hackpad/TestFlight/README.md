## Introduction

The TestFlight SDK allows you to track how beta testers are testing your application. Out of the box we track simple usage information, such as which tester is using your application, their device model/OS, how long they used the application, and automatic recording of any crashes they encounter.

The SDK can track more information if you pass it to TestFlight. The Checkpoint API is used to help you track exactly how your testers are using your application. Curious about which users passed level 5 in your game, or posted their high score to Twitter, or found that obscure feature? See "Checkpoint API" down below to see how.

The SDK also offers a remote logging solution. Find out more about our logging system in the "Remote Logging" section.

## Requirements

The TestFlight SDK requires iOS 4.3 or above, the Apple LLVM compiler, and the libz library to run.

The AdSupport.framework is required for iOS 6.0+ in order to uniquely identify users so we can estimate the number of users your app has (using `ASIdentifierManager`). You may weak link the framework in you app. If your app does not link with the AdSupport.framework, the TestFlight SDK will automatically load it for apps running on iOS 6.0+.

                
## Integration

1. Add the files to your project: File -> Add Files to " "
    1. Find and select the folder that contains the SDK
    2. Make sure that "Copy items into destination folder (if needed)" is checked
    3. Set Folders to "Create groups for any added folders"
    4. Select all targets that you want to add the SDK to
    
2. Verify that libTestFlight.a has been added to the Link Binary With Libraries Build Phase for the targets you want to use the SDK with     
    1. Select your Project in the Project Navigator
    2. Select the target you want to enable the SDK for
    3. Select the Build Phases tab
    4. Open the Link Binary With Libraries Phase
    5. If libTestFlight.a is not listed, drag and drop the library from your Project Navigator to the Link Binary With Libraries area
    6. Repeat Steps 2 - 5 until all targets you want to use the SDK with have the SDK linked
    
3. Add libz to your Link Binary With Libraries Build Phase
    1. Select your Project in the Project Navigator
    2. Select the target you want to enable the SDK for
    3. Select the Build Phases tab
    4. Open the Link Binary With Libraries Phase
    5. Click the + to add a new library
    6. Find libz.dylib in the list and add it
    7. Repeat Steps 2 - 6 until all targets you want to use the SDK with have libz.dylib
    
4. Get your App Token

    1.  If this is a new application, and you have not uploaded it to TestFlight before, first register it here: [https://testflightapp.com/dashboard/applications/create/]().

        Otherwise, if you have previously uploaded your app to TestFlight, go to your list of applications ([http://testflightapp.com/dashboard/applications/]()) and click on the application you are using from the list.
        
    2. Click on the "App Token" tab on the left. The App Token for that application will be there.
    
5. In your Application Delegate:

    1. Import TestFlight: `#import "TestFlight.h"`
    
    2. Launch TestFlight with your App Token
    
        In your `-application:didFinishLaunchingWithOptions:` method, call `+[TestFlight takeOff:]` with your App Token.

            -(BOOL)application:(UIApplication *)application 
                didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
              // start of your application:didFinishLaunchingWithOptions 

              [TestFlight takeOff:@"Insert your Application Token here"];

              // The rest of your application:didFinishLaunchingWithOptions method
              // ...
            }

    3. To report crashes to you we install our own uncaught exception handler. If you are not currently using an exception handler of your own then all you need to do is go to the next step. If you currently use an Exception Handler, or you use another framework that does please go to the section on advanced exception handling.


## Setting the UDID

For **BETA** apps only: In order for "In App Updates" to work and for user data not to be anonymized, you may provide the device's unique identifier. To send the device identifier call the following method **before** your call to `+[TestFlight takeOff:]` like so:

    [TestFlight setDeviceIdentifier:[[UIDevice currentDevice] uniqueIdentifier]];
    [TestFlight takeOff:@"Insert your Application Token here"];
    
Note: `[[UIDevice currentDevice] uniqueIdentifier]` is deprecated, which means it may be removed from iOS in the future and that it should not be used in production apps. We recommend using it **only** in beta apps. If using it makes you feel uncomfortable, you are not required to include it.

**Note on iOS 7 and Xcode 5**: In iOS 7, `uniqueIdentifier` no longer returns the device's UDID, so iOS 7 users will show up anonymously on TestFlight. Also, when building with ARC, Xcode 5 will not allow you to call `uniqueIdentifier` because it has been removed in iOS 7 from `UIDevice`'s header. We are working on a workaround for this issue.

**DO NOT USE THIS IN PRODUCTION APPS**. When it is time to submit to the App Store comment this line out. Apple will probably reject your app if you leave this line in.


## Uploading your build
    
After you have integrated the SDK into your application you need to upload your build to TestFlight. You can upload your build on our [website](https://testflightapp.com/dashboard/builds/add/), using our [desktop app](https://testflightapp.com/desktop/), or by using our [upload API](https://testflightapp.com/api/doc/).


## Basic Features

### Session Information

View anonymous information about how often users use your app, how long they use it for, and when they use it. You can see what type of device the user is using, which OS, which language, etc.

Sessions automatically start at when the app becomes active and end when the app resigns active. Sessions that start shortly after an end continue the session instead of starting a new one.

NB: Sessions do not start when `takeOff:` is called, `takeOff:` registers callbacks to start sessions when the app is active.

For **beta** users, you can see who the users are if you are **setting the UDID**, they have a TestFlight account, and their device is registered to TestFlight. (See Setting the UDID for more information).


### Crash Reports

The TestFlight SDK automatically reports all crashes (beta and prod) to TestFlight's website where you can view them. Crash reports are sent **at** crash time. TestFlight will also automatically symbolicate all crashes (if you have uploaded your dSYM). For **beta** apps, on the site, you can see which checkpoints the user passed before the crash and see remote logs that were sent before the crash. For **prod** apps, you can see remote logs that were sent before the crash.


### Beta In App Updates  

If a user is using a **beta** version of your app, you are **setting the UDID**, a new beta version is available, and that user has permission to install it; an in app popup will ask them if they would like to install the update. If they tap "Install", the new version is installed from inside the app.

NB: For this to work, you must increment your build version before uploading. Otherwise the new and old builds will have the same version number and we won't know if the user needs to update or is already using the new version.

To turn this off set this option before calling `takeOff:`
    
    [TestFlight setOptions:@{ TFOptionDisableInAppUpdates : @YES }];


## Additional Features
    
### Checkpoints

When a tester does something you care about in your app, you can pass a checkpoint. For example completing a level, adding a todo item, etc. The checkpoint progress is used to provide insight into how your testers are testing your apps. The passed checkpoints are also attached to crashes, which can help when creating steps to replicate. Checkpoints are visible for all beta and prod builds.

    [TestFlight passCheckpoint:@"CHECKPOINT_NAME"];

Use `passCheckpoint:` to track when a user performs certain tasks in your application. This can be useful for making sure testers are hitting all parts of your application, as well as tracking which testers are being thorough.

Checkpoints are meant to tell you if a user visited a place in your app or completed a task. They should not be used for debugging purposes. Instead, use Remote Logging for debugging information (more information below).

NB: Checkpoints are only recorded during sessions.


### Custom Environment Information

In **beta** builds, if you want to see some extra information about your user, you can add some custom environment information. You must add this information before the session starts (a session starts at `takeOff:`) to see it on TestFlight's website. NB: You can only see this information for **beta** users.

    [TestFlight addCustomEnvironmentInformation:@"info" forKey:@"key"];

You may call this method as many times as you would like to add more information.


### User Feedback

In **beta** builds, if you collect feedback from your users, you may pass it back to TestFlight which will associate it with the user's current session.

    [TestFlight submitFeedback:feedback];

Once users have submitted feedback from inside of the application you can view it in the feedback area of your build page.


### Remote Logging

Remote Logging allows you to see the logs your app prints out remotely, on TestFlight's website. You can see logs for **beta sessions** and **prod sessions with crashes**. NB: you cannot see the logs for all prod sessions.

To use it, simply replace all of your `NSLog` calls with `TFLog` calls. An easy way to do this without rewriting all your `NSLog` calls is to add the following macro to your `.pch` file.

    #import "TestFlight.h"
    #define NSLog TFLog

Not only will `TFLog` log remotely to TestFlight, it will also log to the console (viewable in a device's logs) and STDERR (shown while debugging) just like NSLog does, providing a complete replacement.

For even better information in your remote logs, such as file name and line number, you can use this macro instead:

    #define NSLog(__FORMAT__, ...) TFLog((@"%s [Line %d] " __FORMAT__), __PRETTY_FUNCTION__, __LINE__, ##__VA_ARGS__)

Which will produce output that looks like

    -[MyAppDelegate application:didFinishLaunchingWithOptions:] [Line 45] Launched!
    
NB: Logs are only recorded during sessions.

**Custom Logging**

If you have your own custom logging, call `TFLog` from your custom logging function. If you do not need `TFLog` to log to the console or STDERR because you handle those yourself, you can turn them off with these calls:

    [TestFlight setOptions:@{ TFOptionLogToConsole : @NO }];
    [TestFlight setOptions:@{ TFOptionLogToSTDERR : @NO }];
    
## Advanced Notes

### Checkpoint API

When passing a checkpoint, TestFlight logs the checkpoint synchronously (See Remote Logging for more information). If your app has very high performance needs, you can turn the logging off with the `TFOptionLogOnCheckpoint` option.


### Remote Logging

All logging is done synchronously. Every time the SDK logs, it must write data to a file. This is to ensure log integrity at crash time. Without this, we could not trust logs at crash time. If you have a high performance app, please email support@testflightapp.com for more options.

### Advanced Session Control

Continuing sessions: You can adjust the amount of time a user can leave the app for and still continue the same session when they come back by changing the `TFOptionSessionKeepAliveTimeout` option. Change it to 0 to turn the feature off.

Manual Session Control: If your app is a music player that continues to play music in the background, a navigation app that continues to function in the background, or any app where a user is considered to be "using" the app even while the app is not active you should use Manual Session Control. Please only use manual session control if you know exactly what you are doing. There are many pitfalls which can result in bad session duration and counts. See `TestFlight+ManualSessions.h` for more information and instructions.

### Advanced Exception/Signal Handling

An uncaught exception means that your application is in an unknown state and there is not much that you can do but try and exit gracefully. Our SDK does its best to get the data we collect in this situation to you while it is crashing, but it is designed in such a way that the important act of saving the data occurs in as safe way a way as possible before trying to send anything. If you do use uncaught exception or signal handlers, install your handlers before calling `takeOff:`. Our SDK will then call your handler while ours is running. For example:

      /*
       My Apps Custom uncaught exception catcher, we do special stuff here, and TestFlight takes care of the rest
      */
      void HandleExceptions(NSException *exception) {
        NSLog(@"This is where we save the application data during a exception");
        // Save application data on crash
      }
      /*
       My Apps Custom signal catcher, we do special stuff here, and TestFlight takes care of the rest
      */
      void SignalHandler(int sig) {
        NSLog(@"This is where we save the application data during a signal");
        // Save application data on crash
      }

      -(BOOL)application:(UIApplication *)application 
      didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {    
        // installs HandleExceptions as the Uncaught Exception Handler
        NSSetUncaughtExceptionHandler(&HandleExceptions);
        // create the signal action structure 
        struct sigaction newSignalAction;
        // initialize the signal action structure
        memset(&newSignalAction, 0, sizeof(newSignalAction));
        // set SignalHandler as the handler in the signal action structure
        newSignalAction.sa_handler = &SignalHandler;
        // set SignalHandler as the handlers for SIGABRT, SIGILL and SIGBUS
        sigaction(SIGABRT, &newSignalAction, NULL);
        sigaction(SIGILL, &newSignalAction, NULL);
        sigaction(SIGBUS, &newSignalAction, NULL);
        // Call takeOff after install your own unhandled exception and signal handlers
        [TestFlight takeOff:@"Insert your Application Token here"];
        // continue with your application initialization
      }

You do not need to add the above code if your application does not use exception handling already.

