//
//  hprecursiveblock.c
//  Hackpad
//
//
//  Copyright (c) 2013 Hackpad. All rights reserved.
//

#include "hprecursiveblock.h"

#include <Block.h>

hp_recursive_block_t
hp_recursive_block(void (^block)(hp_recursive_block_t))
{
    return Block_copy(^{ block(hp_recursive_block(block)); });
}
