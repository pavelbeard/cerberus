import type { CerberusConfig, CerberusInstance } from '../types';
import { stableStringify } from '../utils/stable-stringify';
import { createCerberus } from './create-cerberus';

let instance: CerberusInstance | undefined;
let signature: string | undefined;
let loaderRef: CerberusConfig['loader'];

function configSignature(config: CerberusConfig): string {
  return stableStringify({
    strategies: config.strategies.map((strategy) => strategy.config),
    cacheResults: config.cacheResults,
    maxCacheSize: config.maxCacheSize,
  });
}

/**
 * Initializes the singleton (or returns it if already initialized with the
 * SAME config). Calling it again with a DIFFERENT config throws — call
 * `resetCerberus()` first (intended for tests). Documented choice: error on
 * divergent config instead of silently re-initializing.
 */
export function initCerberus(config: CerberusConfig): CerberusInstance {
  if (instance) {
    const sameLoader = (config.loader ?? undefined) === (loaderRef ?? undefined);
    if (sameLoader && configSignature(config) === signature) return instance;
    throw new Error(
      'cerberus: already initialized with a different config. Call resetCerberus() first (tests only).',
    );
  }
  instance = createCerberus(config);
  signature = configSignature(config);
  loaderRef = config.loader;
  return instance;
}

/** Access to the singleton instance; throws a clear error if not initialized. */
export function getCerberus(): CerberusInstance {
  if (!instance) {
    throw new Error('cerberus: not initialized. Call initCerberus(config) first.');
  }
  return instance;
}

/** Tests only: resets the singleton and, with it, both cache levels. */
export function resetCerberus(): void {
  instance = undefined;
  signature = undefined;
  loaderRef = undefined;
}
