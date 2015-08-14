//
//  TestFlight+AsyncLogging.h
//  libTestFlight
//
//  Created by Jason Gregori on 2/12/13.
//  Copyright (c) 2013 TestFlight. All rights reserved.
//

/*

 When logging, it is important that logs are written synchronously. In the event of a crash, all logs that happened before the crash are gauranteed to be on disk. If they were written asynchronously and a crash occurs, you might lose some very valuable logs that might have helped fixed the crash.
 
 However, because TFLog waits until writing to disk is complete, it takes a while. If you have a very high preformance app that can't afford to wait for logs, these functions are for you.
 
 USE THESE, BUT KNOW YOU RISK LOSING SOME LOGS AT CRASH TIME
 
 */

#import "TestFlight.h"



#if __cplusplus
extern "C" {
#endif
    void TFLog_async(NSString *format, ...) __attribute__((format(__NSString__, 1, 2)));
    void TFLogv_async(NSString *format, va_list arg_list);
#if __cplusplus
}
#endif