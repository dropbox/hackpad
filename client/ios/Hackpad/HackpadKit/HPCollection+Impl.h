//
//  HPCollection+Impl.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#import "HPCollection.h"

COREDATA_EXTERN NSString * const HPCollectionIdParam;

#define HPCollectionEntity (NSStringFromClass([HPCollection class]))

@interface HPCollection (Impl)

@property (nonatomic, readonly) NSURL *APIURL;
- (void)deleteWithCompletion:(void (^)(HPCollection *collection, NSError *))handler;

- (void)addPadsObject:(HPPad *)pad
           completion:(void (^)(HPCollection *, NSError *))handler;

- (void)removePadsObject:(HPPad *)pad
              completion:(void (^)(HPCollection *, NSError *))handler;

- (void)setFollowed:(BOOL)followed
         completion:(void (^)(HPCollection *, NSError *))handler;

@end
