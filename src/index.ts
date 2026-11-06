/**
 * cerberus — composable profanity-filter library.
 *
 * Public API:
 * - singleton: `initCerberus(config)` / `getCerberus()` / `resetCerberus()`
 * - configurable instances (dynamic config): `new CerberusBuilder(config?).build()`
 * - strategy factories: `levenshtein({...})`, `glin({...})`
 * - engine + utils: `FilterLevenshtein`, `levenshteinDistance`, `normalize`, `validateNewWord`
 * - executable evasion battery: `GLIN_ONLY`, `LEVENSHTEIN_ONLY`, `CLEAN`, `BATTERY`
 * - constants: `CHARACTER_LIST`, `REPLACE_WITH_DEFAULT`, ...
 * - global types (see `src/types`)
 *
 * The library knows nothing about databases, repositories or HTTP: word
 * lists arrive via config or through the optional external `loader`.
 */
export { CerberusBuilder } from './factory/cerberus-builder';
export { getCerberus, initCerberus, resetCerberus } from './factory/singleton';
export {
  FilterLevenshtein,
  LevenshteinStrategy,
  levenshtein,
  levenshteinDistance,
  normalize,
  validateNewWord,
} from './strategies/levenshtein';
export { GlinStrategy, glin } from './strategies/glin';
export type {
  CheckProfanityResult,
  Filter,
  FilterConfig,
  Language,
  LeetspeakLevel,
  Match,
  ObfuscationLevel,
  ObfuscationOptions,
  SeverityLevel,
} from './strategies/glin';
export * from './battery';
export * from './constants';
export * from './types';
