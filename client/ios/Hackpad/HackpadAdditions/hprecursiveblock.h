//
//  hprecursiveblock.h
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#ifndef Hackpad_hprecursiveblock_h
#define Hackpad_hprecursiveblock_h

typedef void (^hp_recursive_block_t)(void);

hp_recursive_block_t hp_recursive_block(void (^block)(hp_recursive_block_t));

#endif
