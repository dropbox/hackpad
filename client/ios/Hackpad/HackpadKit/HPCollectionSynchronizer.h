//
//  HPCollectionSynchronizer.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import "HPSynchronizer.h"

@class HPSpace;

@interface HPCollectionSynchronizer : HPSynchronizer <HPSynchronizerDelegate>

- (id)initWithSpace:(HPSpace *)space;

@end
