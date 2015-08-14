//
//  HPPad.h
//  Hackpad
//
//
//  Copyright (c) 2014 Hackpad. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreData/CoreData.h>

@class HPCollection, HPImageUpload, HPPadEditor, HPPadSearch, HPSharingOptions, HPSpace;

@interface HPPad : NSManagedObject

@property (nonatomic, retain) NSString * authorName;
@property (nonatomic, retain) id authorNames;
@property (nonatomic, retain) NSString * authorPic;
@property (nonatomic) BOOL deleting;
@property (nonatomic) float expandedSnippetHeight;
@property (nonatomic) BOOL followed;
@property (nonatomic) BOOL hasMissedChanges;
@property (nonatomic) NSTimeInterval lastEditedDate;
@property (nonatomic, retain) NSString * padID;
@property (nonatomic) float snippetHeight;
@property (nonatomic, retain) NSString * snippetHTML;
@property (nonatomic, retain) id snippetUserPics;
@property (nonatomic, retain) NSString * title;
@property (nonatomic) NSTimeInterval authorLastEditedDate;
@property (nonatomic, retain) NSSet *collections;
@property (nonatomic, retain) HPPadEditor *editor;
@property (nonatomic, retain) NSSet *imageUploads;
@property (nonatomic, retain) HPPadSearch *search;
@property (nonatomic, retain) HPSharingOptions *sharingOptions;
@property (nonatomic, retain) HPSpace *space;
@end

@interface HPPad (CoreDataGeneratedAccessors)

- (void)addCollectionsObject:(HPCollection *)value;
- (void)removeCollectionsObject:(HPCollection *)value;
- (void)addCollections:(NSSet *)values;
- (void)removeCollections:(NSSet *)values;

- (void)addImageUploadsObject:(HPImageUpload *)value;
- (void)removeImageUploadsObject:(HPImageUpload *)value;
- (void)addImageUploads:(NSSet *)values;
- (void)removeImageUploads:(NSSet *)values;

@end
