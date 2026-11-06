import { describe, expect, it, vi } from 'vitest';
import {
  CerberusBuilder,
  getCerberus,
  glin,
  levenshtein,
  resetCerberus,
} from '../src';
import { BATTERY_BANNED_WORDS } from '../src/battery';
import { BANNED_WORDS } from './helpers';

describe('CerberusBuilder — configurable, non-global instances', () => {
  it('builds a working instance from a constructor config (dynamic per-call config)', async () => {
    const instance = new CerberusBuilder({
      strategies: [levenshtein({ bannedWords: BANNED_WORDS })],
    }).build();
    const result = await instance.check('fi*nder');
    expect(result.processedText).toBe('****');
    expect(result.containsProfanity).toBe(true);
  });

  it('supports fluent configuration and getConfig()', () => {
    const loader = async () => ['fidel'];
    const builder = new CerberusBuilder()
      .withStrategies([levenshtein({ bannedWords: [] })])
      .addStrategy(glin({ customWords: [] }))
      .withLoader(loader)
      .withCacheResults(false)
      .withMaxCacheSize(77);
    const config = builder.getConfig();
    expect(config.strategies.map((s) => s.id)).toEqual(['levenshtein', 'glin']);
    expect(config.loader).toBe(loader);
    expect(config.cacheResults).toBe(false);
    expect(config.maxCacheSize).toBe(77);
  });

  it('build() without strategies throws a clear error', () => {
    expect(() => new CerberusBuilder().build()).toThrow(/at least one strategy/);
  });

  it('each build() is independent: own caches, no shared state, no singleton registration', async () => {
    resetCerberus();
    const builder = new CerberusBuilder().withStrategies([levenshtein({ bannedWords: BANNED_WORDS })]);
    const a = builder.build();
    const b = builder.build();

    expect(a).not.toBe(b);
    await a.check('fi*nder');
    await a.check('fi*nder');
    expect(a.getStats().hits).toBe(1);
    expect(b.getStats()).toEqual({ hits: 0, misses: 0, resultCacheSize: 0, instanceCacheSize: 0 });

    a.invalidate();
    expect(a.getStats().resultCacheSize).toBe(0);
    expect(b.getStats().resultCacheSize).toBe(0); // b was never used

    // builder instances do NOT register the global singleton
    expect(() => getCerberus()).toThrow(/not initialized/);
  });

  it('supports dynamic reconfiguration: same builder, new config → new isolated instance', async () => {
    const builder = new CerberusBuilder().withStrategies([levenshtein({ bannedWords: ['fidel'] })]);
    const forFidel = builder.build();
    expect((await forFidel.check('f!del')).containsProfanity).toBe(true);
    expect((await forFidel.check('fi-nder')).containsProfanity).toBe(false);

    // "otro usuario" con otra config dinámica
    const forFinder = builder.withStrategies([levenshtein({ bannedWords: ['finder'] })]).build();
    expect((await forFinder.check('f!del')).containsProfanity).toBe(false);
    expect((await forFinder.check('fi-nder')).containsProfanity).toBe(true);

    // la instancia anterior no se ve afectada por la reconfiguración
    expect((await forFidel.check('f!del')).containsProfanity).toBe(true);
    expect(forFidel.getCompositionId()).not.toBe(forFinder.getCompositionId());
  });

  it('works with loader + per-options dynamic word lists', async () => {
    const wordsByOptions: Record<string, string[]> = { tenantA: ['fidel'], tenantB: ['finder'] };
    const loader = vi.fn(async (cacheKey: string) => wordsByOptions[cacheKey] ?? []);
    const instance = new CerberusBuilder()
      .withStrategies([levenshtein({ bannedWords: [] }), glin({ customWords: [], language: 'english' })])
      .withLoader(loader)
      .build();

    const a = await instance.check('f!del', 'tenantA');
    const b = await instance.check('f!del', 'tenantB');
    expect(a.containsProfanity).toBe(true);
    expect(b.containsProfanity).toBe(false);
    expect(loader).toHaveBeenCalledTimes(2);

    instance.invalidate('tenantA');
    wordsByOptions.tenantA = ['otra'];
    const a2 = await instance.check('f!del', 'tenantA');
    expect(a2.containsProfanity).toBe(false);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('respects cache options per built instance (independent LRU sizes)', async () => {
    const small = new CerberusBuilder()
      .withStrategies([levenshtein({ bannedWords: BATTERY_BANNED_WORDS })])
      .withMaxCacheSize(1)
      .build();
    const big = new CerberusBuilder()
      .withStrategies([levenshtein({ bannedWords: BATTERY_BANNED_WORDS })])
      .withMaxCacheSize(10)
      .withCacheResults(true)
      .build();

    await small.check('f.ck');
    await small.check('f.del');
    expect(small.getStats().resultCacheSize).toBe(1); // LRU eviction con tamaño 1

    await big.check('f.ck');
    await big.check('f.del');
    expect(big.getStats().resultCacheSize).toBe(2);
  });
});
