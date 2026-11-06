import type {
  FilterConfig,
  Language,
} from 'glin-profanity';

/**
 * A word removed from the text.
 * - `written`: the real text the user wrote (extracted from the original/processed diff).
 * - `matched`: the prohibited word it matched against.
 */
export interface RemovedWord {
  written: string;
  matched: string;
}

/**
 * Common contract of every strategy and of the composed pipeline.
 * Each strategy is a conservative rewriter: it only rewrites what it can prove.
 */
export interface StrategyCheckResult {
  processedText: string;
  removed: RemovedWord[];
  containsProfanity: boolean;
}

/** Result of the raw levenshtein scanner (keeps the legacy `profaneWords` list). */
export interface ScannerResult extends StrategyCheckResult {
  profaneWords: string[];
}

/** Result of normalizing a token while keeping the mapping to source positions. */
export interface NormalizeTokenResult {
  normalized: string;
  positions: number[];
}

/** Options accepted by the FilterLevenshtein engine. */
export interface FilterLevenshteinOptions {
  bannedWords: string[];
  characterList?: string[];
  replaceWith?: string;
  maxDistance?: number;
  wordBoundary?: boolean;
}

/** Config of the `levenshtein(...)` strategy factory. */
export type LevenshteinStrategyConfig = FilterLevenshteinOptions;

/**
 * Config of the `glin(...)` strategy factory. It is glin-profanity's own
 * `FilterConfig` plus two conveniences:
 * - `language`: single active language (mapped to `languages: [language]`).
 * - `wordBoundary`: alias of glin-profanity's `wordBoundaries`.
 */
export interface GlinStrategyConfig extends FilterConfig {
  language?: Language;
  wordBoundary?: boolean;
}

/**
 * A detection module. `check` is the common contract; `withWords` rebuilds the
 * strategy over a new shared word list (used by the factory when a `loader`
 * resolves the words for the given cacheKey).
 */
export interface Strategy {
  readonly id: string;
  /** Stable key of the strategy configuration; part of the result-cache key. */
  readonly compositionKey: string;
  readonly config: object;
  check(text: string): StrategyCheckResult;
  withWords(words: string[]): Strategy;
}

/** External word-list provider. The app decides how to load words for the given options. */
export type LoaderFn = (cacheKey: string) => Promise<string[]>;

/** Config accepted by `initCerberus`. */
export interface CerberusConfig {
  /**
   * Ordered array of strategies. Order is semantic: the output of each
   * strategy is the input of the next one. Default composition:
   * `[levenshtein({...}), glin({...})]` (conservative rewriter first).
   */
  strategies: Strategy[];
  /** Optional external loader. When present, `check(text, cacheKey)` resolves the word list for that cacheKey. */
  loader?: LoaderFn;
  /** Result cache (factory level) on/off. Default true. */
  cacheResults?: boolean;
  /** Max entries of the result LRU cache. Default 1024. */
  maxCacheSize?: number;
}

/** Runtime counters of the factory caches (useful for tests/monitoring). */
export interface CerberusStats {
  hits: number;
  misses: number;
  resultCacheSize: number;
  instanceCacheSize: number;
}

/** Public API of the singleton instance. */
export interface CerberusInstance {
  /**
   * Runs the composed pipeline over `text`.
   * In static mode (no cacheKey) the configured strategies are used as-is;
   * with a `loader`, pass `cacheKey` to resolve its word list.
   */
  check(text: string, cacheKey?: string): Promise<StrategyCheckResult>;
  /** Alias of `check` — same call, glin-profanity-style name. */
  checkProfanity(text: string, cacheKey?: string): Promise<StrategyCheckResult>;
  /**
   * Atomic invalidation: drops the strategy instances AND the cached results
   * of `cacheKey` (results were computed with the old list).
   * `invalidate()` without cacheKey clears everything.
   */
  invalidate(cacheKey?: string): void;
  /** Id of the configured composition (strategy keys joined with `>`). */
  getCompositionId(): string;
  getStats(): CerberusStats;
}

export type BatteryOwner = 'glin' | 'levenshtein' | 'none';

/** One evasion case of the executable battery: input + declared owner. */
export interface BatteryCase {
  input: string;
  owner: BatteryOwner;
}
