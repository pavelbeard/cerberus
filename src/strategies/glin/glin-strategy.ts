import { Filter as GlinFilterClass } from 'glin-profanity';
import type {
  CheckProfanityResult,
  Filter,
  FilterConfig,
  SeverityLevel,
} from 'glin-profanity';
import { REPLACE_WITH_DEFAULT } from '../../constants';
import type {
  GlinStrategyConfig,
  Strategy,
  StrategyCheckResult,
} from '../../types';
import { stableStringify } from '../../utils/stable-stringify';
import { extractRemovedWrites } from './text-diff';

/**
 * Maps the library config onto glin-profanity's FilterConfig.
 *
 * Defaults (and why):
 * - `leetspeakLevel: 'moderate'` — `aggressive` invents words and produces
 *   false positives; the evasion cushion is put by the levenshtein strategy.
 * - `wordBoundaries: true` (via `wordBoundary`) — verified empirically with
 *   glin-profanity v4: with `false` the legacy fuzzy scan flags clean words
 *   (`cl@ss` → `cl****`) and does not rewrite spaced-out evasions (`f u c k`).
 *   The contextual boundary control for obfuscation chars lives in
 *   `FilterLevenshtein.isWordBoundary`.
 */
function buildFilterConfig(config: GlinStrategyConfig): FilterConfig {
  const { language, wordBoundary, customWords, ...rest } = config;
  const filterConfig: FilterConfig = {
    caseSensitive: false,
    detectLeetspeak: true,
    leetspeakLevel: 'moderate',
    obfuscation: 'standard',
    replaceWith: REPLACE_WITH_DEFAULT,
    ...rest,
    customWords: customWords && customWords.length ? customWords : undefined,
    wordBoundaries: wordBoundary ?? rest.wordBoundaries ?? true,
  };
  if (rest.allLanguages) {
    filterConfig.allLanguages = true;
    delete filterConfig.languages;
  } else {
    filterConfig.languages = language ? [language] : (rest.languages ?? ['english']);
  }
  return filterConfig;
}

/**
 * `glin` strategy: a thin passthrough over `glin-profanity.Filter`. It exposes
 * the FULL Filter API (`isProfane`, `checkProfanity`, `clearCache`, ...) plus
 * the common strategy contract (`check`), where `removed` carries the real
 * text the user wrote (diffed) instead of the canonical dictionary form.
 */
export class GlinStrategy implements Strategy {
  readonly id = 'glin';

  readonly config: GlinStrategyConfig;

  private filterInstance: Filter | undefined;

  constructor(config: GlinStrategyConfig = {}) {
    this.config = { ...config };
  }

  private get filter(): Filter {
    if (!this.filterInstance) {
      // glin-profanity is a hard dependency of cerberus — static import above.
      this.filterInstance = new GlinFilterClass(buildFilterConfig(this.config));
    }
    return this.filterInstance;
  }

  get compositionKey(): string {
    return `${this.id}(${stableStringify(this.config)})`;
  }

  check(text: string): StrategyCheckResult {
    const result = this.filter.checkProfanity(text);
    const processedText = result.processedText ?? text;
    const writes = extractRemovedWrites(text, processedText);
    const removed = writes.map((written, index) => ({
      written,
      matched: result.profaneWords[index] ?? result.profaneWords[0] ?? written,
    }));
    return {
      processedText,
      removed,
      containsProfanity: result.containsProfanity,
    };
  }

  /** Rebuilds the strategy over a new shared word list (factory + loader). */
  withWords(words: string[]): Strategy {
    return new GlinStrategy({ ...this.config, customWords: [...words] });
  }

  // ---- Passthrough of the complete glin-profanity Filter API ----

  /** Raw underlying Filter instance (full API access). */
  get rawFilter(): Filter {
    return this.filter;
  }

  isProfane(value: string): boolean {
    return this.filter.isProfane(value);
  }

  checkProfanity(text: string): CheckProfanityResult {
    return this.filter.checkProfanity(text);
  }

  matches(word: string): boolean {
    return this.filter.matches(word);
  }

  checkProfanityWithMinSeverity(text: string, minSeverity?: SeverityLevel) {
    return this.filter.checkProfanityWithMinSeverity(text, minSeverity);
  }

  clearCache(): void {
    this.filter.clearCache();
  }

  getCacheSize(): number {
    return this.filter.getCacheSize();
  }

  getConfig(): FilterConfig {
    return this.filter.getConfig();
  }

  getWordCount(): number {
    return this.filter.getWordCount();
  }
}

/** Strategy factory: `glin({...})`. */
export function glin(config: GlinStrategyConfig = {}): Strategy {
  return new GlinStrategy(config);
}

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
} from 'glin-profanity';
