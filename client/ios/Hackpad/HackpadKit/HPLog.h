//
//  HPLog.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#ifndef Hackpad_HPLog_h
#define Hackpad_HPLog_h

#if DEBUG
#define HPLog( s, ... ) NSLog( @"<%s:%d> %@", __PRETTY_FUNCTION__, __LINE__, \
    [NSString stringWithFormat:(s), ##__VA_ARGS__] )
#else
#define HPLog( s, ... )
#endif

#endif
