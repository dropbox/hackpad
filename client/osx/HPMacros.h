#ifdef HPLOGGING
#define HPNotify NSLog( @"%s", __PRETTY_FUNCTION__ )
#define HPLog(args...) NSLog( @"%s: %@", __PRETTY_FUNCTION__, [NSString stringWithFormat:args] )
#else
#define HPNotify
#define HPLog(args...)
#endif
