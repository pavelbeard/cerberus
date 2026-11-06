import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCerberus } from '../src/factory/create-cerberus';
import { getCerberus, GlinStrategy, glin, initCerberus, levenshtein, resetCerberus } from '../src';
import { BANNED_WORDS } from './helpers';

afterEach(() => resetCerberus());

describe('singleton semantics', () => {
  it('getCerberus without init throws a clear error', () => {
    expect(() => getCerberus()).toThrow(/not initialized/);
  });

  it('initCerberus is idempotent with the SAME config (structurally equal)', () => {
    const first = initCerberus({ strategies: [levenshtein({ bannedWords: BANNED_WORDS })] });
    const second = initCerberus({ strategies: [levenshtein({ bannedWords: [...BANNED_WORDS] })] });
    expect(second).toBe(first);
  });

  it('initCerberus with a DIFFERENT config throws and demands resetCerberus', () => {
    initCerberus({ strategies: [levenshtein({ bannedWords: ['a'] })] });
    expect(() => initCerberus({ strategies: [levenshtein({ bannedWords: ['b'] })] }))
      .toThrow(/resetCerberus/);
    // same loader reference is fine, different loader is a different config
    const loader = async () => ['a'];
    resetCerberus();
    initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader });
    expect(() => initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader: async () => ['a'] }))
      .toThrow(/resetCerberus/);
    expect(initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader })).toBeDefined();
  });

  it('resetCerberus clears the singleton AND both cache levels', async () => {
    const strategy = levenshtein({ bannedWords: BANNED_WORDS });
    initCerberus({ strategies: [strategy], loader: async () => BANNED_WORDS });
    const instance = getCerberus();
    await instance.check('fi*nder');
    await instance.check('fi*nder', 'cacheKey-1');
    expect(instance.getStats().resultCacheSize).toBeGreaterThan(0);
    expect(instance.getStats().instanceCacheSize).toBeGreaterThan(0);

    resetCerberus();
    expect(() => getCerberus()).toThrow(/not initialized/);

    initCerberus({ strategies: [levenshtein({ bannedWords: BANNED_WORDS })] });
    const fresh = getCerberus();
    expect(fresh.getStats()).toEqual({ hits: 0, misses: 0, resultCacheSize: 0, instanceCacheSize: 0 });
  });

  it('createCerberus exists as internal factory for tests (not in the public index)', async () => {
    const instance = createCerberus({ strategies: [levenshtein({ bannedWords: BANNED_WORDS })] });
    const result = await instance.check('fi*nder');
    expect(result.processedText).toBe('****');
  });

  it('rejects an empty strategies array', () => {
    expect(() => initCerberus({ strategies: [] })).toThrow(/strategies/);
  });

  it('checkProfanity is an alias of check (same function, glin-profanity-style name)', async () => {
    initCerberus({ strategies: [levenshtein({ bannedWords: BANNED_WORDS })] });
    const cerberus = getCerberus();
    expect(cerberus.checkProfanity).toBe(cerberus.check);
    expect((cerberus as unknown as Record<string, unknown>).validate).toBeUndefined();
    const result = await cerberus.checkProfanity('fi*nder');
    expect(result.processedText).toBe('****');
    expect(result.containsProfanity).toBe(true);
  });
});

describe('factory result cache (migrated "with cache" assertions)', () => {
  it('second call with the same text hits the singleton result cache', async () => {
    const strategy = levenshtein({ bannedWords: BANNED_WORDS });
    const spy = vi.spyOn(strategy, 'check');
    initCerberus({ strategies: [strategy] });
    const cerberus = getCerberus();

    const input = 'text by t.st';
    const first = await cerberus.check(input);
    const second = await cerberus.check(input);

    expect(second).toEqual(first);
    expect(first.processedText).toBe('text by ****');
    expect(spy).toHaveBeenCalledTimes(1); // computed once, served from cache after
    expect(cerberus.getStats().hits).toBe(1);
    expect(cerberus.getStats().misses).toBe(1);
  });

  it('evicts LRU entries beyond maxCacheSize', async () => {
    const strategy = levenshtein({ bannedWords: BANNED_WORDS });
    const spy = vi.spyOn(strategy, 'check');
    initCerberus({ strategies: [strategy], maxCacheSize: 2 });
    const cerberus = getCerberus();

    await cerberus.check('fi*nder');
    await cerberus.check('fi_nder');
    await cerberus.check('fi-nder');
    expect(cerberus.getStats().resultCacheSize).toBe(2);

    await cerberus.check('fi*nder'); // was evicted → recompute
    expect(spy).toHaveBeenCalledTimes(4);
    expect(cerberus.getStats().misses).toBe(4);
    expect(cerberus.getStats().hits).toBe(0);
  });

  it('cacheResults: false disables the result cache', async () => {
    const strategy = levenshtein({ bannedWords: BANNED_WORDS });
    const spy = vi.spyOn(strategy, 'check');
    initCerberus({ strategies: [strategy], cacheResults: false });
    const cerberus = getCerberus();
    await cerberus.check('fi*nder');
    await cerberus.check('fi*nder');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(cerberus.getStats().resultCacheSize).toBe(0);
  });
});

describe('loader mode (external word lists, cacheKey-scoped instances)', () => {
  it('resolves strategies per cacheKey through the loader and caches them', async () => {
    const wordsByEntity: Record<string, string[]> = { e1: ['fidel'], e2: ['finder'] };
    const loader = vi.fn(async (cacheKey: string) => wordsByEntity[cacheKey] ?? []);
    initCerberus({
      strategies: [levenshtein({ bannedWords: [] }), glin({ customWords: [], language: 'english' })],
      loader,
    });
    const cerberus = getCerberus();

    const r1 = await cerberus.check('f!del', 'e1');
    expect(r1.containsProfanity).toBe(true);
    expect(r1.processedText).toBe('****');

    // same text, different cacheKey → different composition → NO cache collision
    const r2 = await cerberus.check('f!del', 'e2');
    expect(r2.containsProfanity).toBe(false);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cerberus.getStats().instanceCacheSize).toBe(2);

    // instances cached: no more loader calls for known entities
    await cerberus.check('fi-nder', 'e2');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent loads and concurrent validations', async () => {
    let loaderCalls = 0;
    const loader = vi.fn(async (cacheKey: string) => {
      loaderCalls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return ['fidel'];
    });
    initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader });
    const cerberus = getCerberus();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => cerberus.check('f!del', 'e1')),
    );
    expect(loader).toHaveBeenCalledTimes(1); // pendingLoads dedupe
    // in loader mode strategies are rebuilt via withWords, so the dedupe of
    // concurrent validations is observed through the result-cache stats:
    expect(cerberus.getStats().misses).toBe(1); // computed once for the shared key
    expect(cerberus.getStats().hits).toBe(0);
    for (const r of results) expect(r.processedText).toBe('****');

    const sixth = await cerberus.check('f!del', 'e1');
    expect(sixth.processedText).toBe('****');
    expect(cerberus.getStats().hits).toBe(1);
    expect(loaderCalls).toBe(1);
  });

  it('invalidate(cacheKey) is atomic: drops instances AND results together', async () => {
    const wordsByEntity: Record<string, string[]> = { e1: ['fidel'] };
    const loader = vi.fn(async (cacheKey: string) => wordsByEntity[cacheKey] ?? []);
    initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader });
    const cerberus = getCerberus();

    const before = await cerberus.check('f!del', 'e1');
    expect(before.containsProfanity).toBe(true);
    await cerberus.check('f!del', 'e1'); // now cached
    expect(cerberus.getStats().hits).toBe(1);

    wordsByEntity.e1 = ['somethingelse'];
    cerberus.invalidate('e1');

    const after = await cerberus.check('f!del', 'e1');
    expect(loader).toHaveBeenCalledTimes(2); // instance rebuilt
    expect(after.containsProfanity).toBe(false); // old result NOT served from cache
    expect(cerberus.getStats().instanceCacheSize).toBe(1);
  });

  it('invalidate() without cacheKey clears everything', async () => {
    const loader = vi.fn(async () => ['fidel']);
    initCerberus({ strategies: [levenshtein({ bannedWords: [] })], loader });
    const cerberus = getCerberus();
    await cerberus.check('f!del', 'e1');
    await cerberus.check('fi*nder');
    expect(cerberus.getStats().resultCacheSize).toBe(2);
    cerberus.invalidate();
    expect(cerberus.getStats().resultCacheSize).toBe(0);
    expect(cerberus.getStats().instanceCacheSize).toBe(0);
  });

  it('check with cacheKey but no loader throws a clear error', async () => {
    initCerberus({ strategies: [levenshtein({ bannedWords: ['fidel'] })] });
    await expect(getCerberus().check('f!del', 'e1')).rejects.toThrow(/no loader/);
  });
});

describe('glin strategy passthrough', () => {
  it('exposes the full glin-profanity Filter API plus the strategy contract', async () => {
    const strategy = new GlinStrategy({ customWords: ['fidel'], language: 'english' });
    expect(strategy.id).toBe('glin');
    expect(strategy.isProfane('fuck')).toBe(true);
    expect(strategy.isProfane('hello')).toBe(false);
    expect(strategy.matches('fidel')).toBe(true);
    const raw = strategy.checkProfanity('f4ck');
    expect(raw.containsProfanity).toBe(true);
    expect(strategy.getWordCount()).toBeGreaterThan(0);
    expect(strategy.getConfig()).toMatchObject({ detectLeetspeak: true, leetspeakLevel: 'moderate' });
    strategy.clearCache();
    expect(strategy.getCacheSize()).toBe(0);
    expect(strategy.rawFilter).toBeDefined();

    const viaContract = strategy.check('f4ck');
    expect(viaContract.containsProfanity).toBe(true);
    expect(viaContract.processedText).toBe('****');
    expect(viaContract.removed[0].written).toBe('f4ck');
  });
});

describe('library boundaries', () => {
  it('no repository / database / express references anywhere in src', () => {
    const srcDir = join(__dirname, '..', 'src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(srcDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/banned-words\.repository|mongoose|express|@allfundsbank|process\.env/);
    }
  });
});
