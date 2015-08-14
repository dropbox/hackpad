//
//  HPReachability.m
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPReachability.h"

#import <TestFlight/TestFlight.h>

@interface HPReachability () {
    BOOL connectionRequired;
    NetworkStatus currentReachabilityStatus;
}
@end

@interface Reachability (PrivateMethods)
- (NetworkStatus) networkStatusForFlags: (SCNetworkReachabilityFlags) flags;
- (NetworkStatus) localWiFiStatusForFlags: (SCNetworkReachabilityFlags) flags;
@end

@implementation HPReachability

static void PrintReachabilityFlags(SCNetworkReachabilityFlags flags, const char* comment)
{
#if DEBUG || AD_HOC
    TFLog(@"Reachability Flag Status: %c%c %c%c%c%c%c%c%c %s",
          (flags & kSCNetworkReachabilityFlagsIsWWAN)				? 'W' : '-',
          (flags & kSCNetworkReachabilityFlagsReachable)            ? 'R' : '-',

          (flags & kSCNetworkReachabilityFlagsTransientConnection)  ? 't' : '-',
          (flags & kSCNetworkReachabilityFlagsConnectionRequired)   ? 'c' : '-',
          (flags & kSCNetworkReachabilityFlagsConnectionOnTraffic)  ? 'C' : '-',
          (flags & kSCNetworkReachabilityFlagsInterventionRequired) ? 'i' : '-',
          (flags & kSCNetworkReachabilityFlagsConnectionOnDemand)   ? 'D' : '-',
          (flags & kSCNetworkReachabilityFlagsIsLocalAddress)       ? 'l' : '-',
          (flags & kSCNetworkReachabilityFlagsIsDirect)             ? 'd' : '-',
          comment
          );
#endif
}

- (void)updateStatusWithFlags:(SCNetworkConnectionFlags)flags
{
    PrintReachabilityFlags(flags, "updateStatusWithFlags");
    @synchronized(self) {
        connectionRequired = flags & kSCNetworkFlagsConnectionRequired;
        currentReachabilityStatus = localWiFiRef
            ? [self localWiFiStatusForFlags:flags]
            : [self networkStatusForFlags:flags];
    }
}

static void ReachabilityCallback(SCNetworkReachabilityRef target, SCNetworkReachabilityFlags flags, void* info)
{
#pragma unused (target, flags)
	NSCAssert(info != NULL, @"info was NULL in ReachabilityCallback");
	NSCAssert([(__bridge NSObject*) info isKindOfClass: [Reachability class]], @"info was wrong class in ReachabilityCallback");

    HPReachability* noteObject = (__bridge HPReachability *)info;
    [noteObject updateStatusWithFlags:flags];
    // Post a notification to notify the client that the network reachability changed.
    [[NSNotificationCenter defaultCenter] postNotificationName: kReachabilityChangedNotification object: noteObject];
}

- (BOOL)startNotifier
{
	BOOL returnValue = NO;
	SCNetworkReachabilityContext context = {0, (__bridge void *)(self), NULL, NULL, NULL};

	if (SCNetworkReachabilitySetCallback(reachabilityRef, ReachabilityCallback, &context))
	{
		if (SCNetworkReachabilityScheduleWithRunLoop(reachabilityRef, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode))
		{
			returnValue = YES;
		}
	}
    SCNetworkReachabilityFlags flags;
    if (SCNetworkReachabilityGetFlags(reachabilityRef, &flags)) {
        [self updateStatusWithFlags:flags];
    }
	return returnValue;
}

- (BOOL)connectionRequired
{
    BOOL ret;
    @synchronized (self) {
        ret = connectionRequired;
    }
    return ret;
}

- (NetworkStatus) currentReachabilityStatus
{
    NetworkStatus status;
    @synchronized (self) {
        status = currentReachabilityStatus;
    }
    return status;
}

@end
