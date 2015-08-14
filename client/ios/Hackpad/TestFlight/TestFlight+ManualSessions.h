//
//  TestFlight+ManualSessions.h
//  libTestFlight
//
//  Created by Jason Gregori on 5/16/13.
//  Copyright (c) 2013 TestFlight. All rights reserved.
//

/*
 
 YOU ARE STRONGLY ADVISED NOT TO USE THESE METHODS unless you know exactly what you are doing. By using these you take on the responsibility of ensuring your session data is reported accurately.
 
 The way TestFlight normally does sessions is to automatically start them at app launch, app did become active, and app will enter foreground and end them at app will resign active, app did enter background, or app will terminate.

 If your app is a music player that continues to play music in the background, a navigation app that continues to function in the background, or any app where a user is considered to be "using" the app even while the app is not active, this file is for you.
 
 
 Usage
 -----
 
 1. Add this file to your project.

 2. Set the manual sessions option to true **before** calling `takeOff:`
 
         [TestFlight setOptions:@{ TFOptionManualSessions : @YES }];
 
 3. Use the manually start/end session methods to control you sessions.
 
 
 Pitfalls
 --------
 
 When using manual sessions in the background, you must always be aware of the fact that iOS may suspend your app at any time without any warning. You must end your session before that happens. If you do not, the session will continue and include all the time the app was suspended in it's duration if the app is brought back from suspension. This will lead to very inaccurate session lengths and counts.
 
 On app termination: For the most accurate sessions, try to end your session if you know the app is about to terminate. If you do not, the session will still be ended on the next launch, however, it's end time will not be exact. In that case, the end time will be within 30 seconds of the correct time (session information is saved every 30 seconds and when a checkpoint is sent).
 
 Sessions do not continue across termination if you do not end a session before termination.

 On crashes: Do not worry about ending sessions in the event of a crash. Even manual sessions are automatically ended in the event of a crash.
 
 Continuing sessions: If a session is started without 30 seconds of the last session ending (and their was no termination between the sessions), the last session will continue instead of a new session starting. This is the case in manual and automatic sessions. You may change the timeout or turn this feature off using the `TFOptionSessionKeepAliveTimeout` option.

 */

#import "TestFlight.h"



extern NSString *const TFOptionManualSessions; // Defaults to @NO. Set to @YES before calling `takeOff:` in order to use manual session methods.


@interface TestFlight (ManualSessions)

// these methods are thread safe
+ (void)manuallyStartSession;
+ (void)manuallyEndSession;

@end
