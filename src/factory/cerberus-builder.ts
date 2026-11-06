import type {
  CerberusConfig,
  CerberusInstance,
  LoaderFn,
  Strategy,
} from '../types';
import { createCerberus } from './create-cerberus';

/**
 * Configurable, NON-global way to obtain `CerberusInstance`s.
 *
 * Use the singleton (`initCerberus`/`getCerberus`) when the config is fixed
 * for the whole process. Use `CerberusBuilder` when the config is dynamic —
 * e.g. a backend that builds an instance per tenant/request from runtime
 * config:
 *
 * ```typescript
 * // fully dynamic config per call
 * const instance = new CerberusBuilder(dynamicConfig).build();
 *
 * // or a reusable builder with a loader; each build() is independent
 * const builder = new CerberusBuilder()
 *   .withStrategies([levenshtein({ bannedWords: [] }), glin({ customWords: [] })])
 *   .withLoader(async (cacheKey) => loadWordsFor(cacheKey))
 *   .withMaxCacheSize(5000);
 * const instanceA = builder.build(); // tenant A
 * ```
 *
 * Every `build()` returns an independent instance with its OWN two-level
 * caches — nothing is shared with the singleton or with other built
 * instances, so reconfiguring never leaks state.
 */
export class CerberusBuilder {
  private strategies: Strategy[] = [];

  private loader: LoaderFn | undefined;

  private cacheResults: boolean | undefined;

  private maxCacheSize: number | undefined;

  constructor(config: Partial<CerberusConfig> = {}) {
    this.withConfig(config);
  }

  /** Merges a (partial) config into the builder. Fluent. */
  withConfig(config: Partial<CerberusConfig>): this {
    if (config.strategies !== undefined) this.strategies = [...config.strategies];
    if (config.loader !== undefined) this.loader = config.loader;
    if (config.cacheResults !== undefined) this.cacheResults = config.cacheResults;
    if (config.maxCacheSize !== undefined) this.maxCacheSize = config.maxCacheSize;
    return this;
  }

  /** Replaces the ordered strategy composition. Fluent. */
  withStrategies(strategies: Strategy[]): this {
    this.strategies = [...strategies];
    return this;
  }

  /** Appends one strategy (order is semantic: output of one feeds the next). Fluent. */
  addStrategy(strategy: Strategy): this {
    this.strategies.push(strategy);
    return this;
  }

  /** Sets the external word-list loader. Fluent. */
  withLoader(loader: LoaderFn): this {
    this.loader = loader;
    return this;
  }

  /** Enables/disables the factory-level result cache. Fluent. */
  withCacheResults(cacheResults: boolean): this {
    this.cacheResults = cacheResults;
    return this;
  }

  /** Sets the result LRU cache size. Fluent. */
  withMaxCacheSize(maxCacheSize: number): this {
    this.maxCacheSize = maxCacheSize;
    return this;
  }

  /** Returns the resolved config (strategies are copied). */
  getConfig(): CerberusConfig {
    return {
      strategies: [...this.strategies],
      ...(this.loader !== undefined ? { loader: this.loader } : {}),
      ...(this.cacheResults !== undefined ? { cacheResults: this.cacheResults } : {}),
      ...(this.maxCacheSize !== undefined ? { maxCacheSize: this.maxCacheSize } : {}),
    };
  }

  /**
   * Builds a new, independent `CerberusInstance` with its own caches.
   * Throws if no strategy was configured.
   */
  build(): CerberusInstance {
    if (this.strategies.length === 0) {
      throw new Error(
        'cerberus: CerberusBuilder.build() needs at least one strategy — use withStrategies([...]), addStrategy(...) or withConfig({ strategies: [...] }).',
      );
    }
    return createCerberus(this.getConfig());
  }
}
