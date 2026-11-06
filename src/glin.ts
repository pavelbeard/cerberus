/**
 * Subpath `cerberus/glin` — use glin-profanity exactly as if you were
 * importing `glin-profanity` itself (the full API is re-exported: `Filter`,
 * `checkProfanity`, `isWordProfane`, `normalizeLeetspeak`, ... and all types),
 * plus cerberus' own glin strategy factory for the composed pipeline.
 *
 * glin-profanity is a hard dependency of this package, so this subpath always
 * resolves.
 *
 * @example
 * ```typescript
 * import { Filter, checkProfanity, isWordProfane } from 'cerberus/glin';
 * import { glin } from 'cerberus/glin'; // strategy factory for initCerberus
 *
 * const filter = new Filter({ languages: ['spanish'], detectLeetspeak: true });
 * filter.isProfane('f4ck');        // true
 * checkProfanity('f u c k');       // standalone helper
 * isWordProfane('fuck');           // true
 * ```
 */
export * from 'glin-profanity';
export { GlinStrategy, extractRemovedWrites, glin } from './strategies/glin';
