import type {
  LevenshteinStrategyConfig,
  Strategy,
  StrategyCheckResult,
} from '../../types';
import { stableStringify } from '../../utils/stable-stringify';
import { FilterLevenshtein } from './filter-levenshtein';

/**
 * `levenshtein` strategy: the own engine (zero external dependencies, external
 * word lists only — it has no internal dictionary) exposed through the common
 * strategy contract.
 */
export class LevenshteinStrategy implements Strategy {
  readonly id = 'levenshtein';

  readonly config: LevenshteinStrategyConfig;

  private readonly engine: FilterLevenshtein;

  constructor(config: LevenshteinStrategyConfig) {
    this.config = { ...config };
    this.engine = new FilterLevenshtein(config);
  }

  get compositionKey(): string {
    return `${this.id}(${stableStringify(this.config)})`;
  }

  check(text: string): StrategyCheckResult {
    const result = this.engine.checkProfanityLevenshtein(text);
    return {
      processedText: result.processedText,
      removed: result.removed,
      containsProfanity: result.containsProfanity,
    };
  }

  /** Rebuilds the strategy over a new shared word list (factory + loader). */
  withWords(words: string[]): Strategy {
    return new LevenshteinStrategy({ ...this.config, bannedWords: [...words] });
  }

  /** Direct access to the engine (normalizeToken, scanner, ...). */
  get filter(): FilterLevenshtein {
    return this.engine;
  }
}

/** Strategy factory: `levenshtein({ bannedWords: [...] })`. */
export function levenshtein(config: LevenshteinStrategyConfig): Strategy {
  return new LevenshteinStrategy(config);
}
