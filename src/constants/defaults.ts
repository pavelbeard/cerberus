/** Default replacement for a matched span. */
export const REPLACE_WITH_DEFAULT = '****';

/** Default levenshtein aggressiveness dial. */
export const DEFAULT_MAX_DISTANCE = 1;

/** Default word-boundary check for the levenshtein engine. */
export const DEFAULT_WORD_BOUNDARY = true;

/** Default max entries of the factory-level result LRU cache. */
export const DEFAULT_MAX_CACHE_SIZE = 1024;

/** Factory result cache enabled by default. */
export const DEFAULT_CACHE_RESULTS = true;

/**
 * Early-return regex: the whole text is already asterisks (fixed version —
 * the original with spaces did not match multiple tokens).
 */
export const ALL_ASTERISKS_REGEX = /^(\*+\s)*\*+$/;
