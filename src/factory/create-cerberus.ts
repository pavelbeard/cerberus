import {
  ALL_ASTERISKS_REGEX,
  DEFAULT_CACHE_RESULTS,
  DEFAULT_MAX_CACHE_SIZE,
} from '../constants';
import type {
  CerberusConfig,
  CerberusInstance,
  CerberusStats,
  RemovedWord,
  Strategy,
  StrategyCheckResult,
} from '../types';
import { LruCache } from './lru-cache';

/**
 * Internal factory. The public API is the singleton
 * (`initCerberus`/`getCerberus`/`resetCerberus`); this function is exported
 * only so tests can build isolated instances.
 *
 * Two cache levels, both owned here (the strategies themselves have none):
 * - instances: built strategies per `cacheKey` (only when a `loader` is given),
 *   with deduplication of concurrent loads (`pendingLoads`).
 * - results: LRU keyed by `generation:scope::compositionId::text`, so two
 *   different compositions never collide for the same text. Concurrent
 *   checks of the same key share one in-flight promise.
 */
export function createCerberus(config: CerberusConfig): CerberusInstance {
  if (!config || !Array.isArray(config.strategies) || config.strategies.length === 0) {
    throw new Error(
      'cerberus: config.strategies must be a non-empty array — use levenshtein({...}) and/or glin({...}).',
    );
  }

  const cacheResults = config.cacheResults ?? DEFAULT_CACHE_RESULTS;
  const maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  const { loader } = config;

  const instances = new Map<string, Strategy[]>();
  const pendingLoads = new Map<string, Promise<Strategy[]>>();
  const resultCache = new LruCache<string, StrategyCheckResult>(maxCacheSize);
  const pendingValidations = new Map<string, Promise<StrategyCheckResult>>();
  let generation = 0;
  let hits = 0;
  let misses = 0;

  const compositionIdOf = (strategies: Strategy[]): string => strategies
    .map((strategy) => strategy.compositionKey)
    .join('>');

  function runPipeline(strategies: Strategy[], text: string): StrategyCheckResult {
    let current = text;
    let containsProfanity = false;
    const removed: RemovedWord[] = [];

    for (const strategy of strategies) {
      const result = strategy.check(current);
      containsProfanity = containsProfanity || result.containsProfanity;
      removed.push(...result.removed);
      current = result.processedText;
      // Early return: if the text is already all asterisks, stop the pipeline.
      if (ALL_ASTERISKS_REGEX.test(current)) break;
    }

    // Merge `removed` with dedupe by `written`.
    const seen = new Set<string>();
    const deduped = removed.filter((entry) => {
      if (seen.has(entry.written)) return false;
      seen.add(entry.written);
      return true;
    });

    return {
      processedText: deduped.length ? current : text,
      removed: deduped,
      containsProfanity: containsProfanity || deduped.length > 0,
    };
  }

  async function getStrategies(cacheKey?: string): Promise<Strategy[]> {
    if (cacheKey === undefined) return config.strategies;
    if (!loader) {
      throw new Error(
        `cerberus: cannot resolve cacheKey "${cacheKey}" — no loader was provided in the config.`,
      );
    }
    const cached = instances.get(cacheKey);
    if (cached) return cached;
    const pending = pendingLoads.get(cacheKey);
    if (pending) return pending;

    const load = loader(cacheKey).then((words) => {
      // Shared source: every strategy is rebuilt over the same loaded list.
      const strategies = config.strategies.map((strategy) => strategy.withWords(words));
      instances.set(cacheKey, strategies);
      pendingLoads.delete(cacheKey);
      return strategies;
    }, (err) => {
      pendingLoads.delete(cacheKey);
      throw err;
    });
    pendingLoads.set(cacheKey, load);
    return load;
  }

  async function check(text: string, cacheKey?: string): Promise<StrategyCheckResult> {
    const strategies = await getStrategies(cacheKey);
    const scope = cacheKey ?? 'static';
    const key = `${generation}:${scope}::${compositionIdOf(strategies)}::${text}`;

    const pending = pendingValidations.get(key);
    if (pending) return pending;

    if (cacheResults) {
      const hit = resultCache.get(key);
      if (hit) {
        hits += 1;
        return hit;
      }
      misses += 1;
    }

    const run = Promise.resolve()
      .then(() => runPipeline(strategies, text))
      .then((result) => {
        if (cacheResults) resultCache.set(key, result);
        pendingValidations.delete(key);
        return result;
      }, (err) => {
        pendingValidations.delete(key);
        throw err;
      });
    pendingValidations.set(key, run);
    return run;
  }

  function invalidate(cacheKey?: string): void {
    // Atomic: the generation bump makes every in-flight/old result key
    // unreachable, and the instance + its results are dropped together.
    generation += 1;
    if (cacheKey === undefined) {
      instances.clear();
      pendingLoads.clear();
      resultCache.clear();
      return;
    }
    instances.delete(cacheKey);
    pendingLoads.delete(cacheKey);
    for (const key of [...resultCache.keys()]) {
      const scopePart = key.slice(key.indexOf(':') + 1);
      if (scopePart.startsWith(`${cacheKey}::`)) resultCache.delete(key);
    }
  }

  function getStats(): CerberusStats {
    return {
      hits,
      misses,
      resultCacheSize: resultCache.size,
      instanceCacheSize: instances.size,
    };
  }

  return {
    check,
    checkProfanity: check,
    invalidate,
    getCompositionId: () => compositionIdOf(config.strategies),
    getStats,
  };
}
