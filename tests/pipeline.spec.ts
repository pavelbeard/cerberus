import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCerberus,
  glin,
  initCerberus,
  levenshtein,
  resetCerberus,
} from '../src';

// Migrated from banned-words.bll.spec.js, "validation" block (the 14
// test.each cases + the multi-word case). The persistence tests
// (create/rename/upsert/getAll against Mongo, INVALID_FORMAT, DUPLICATE_ROW)
// stay in the app — they belong to the repository, not to this library.
// Here there is no cacheKey/DB: word lists go in config and the composed
// pipeline (levenshtein → glin) runs through the singleton.

const VALIDATION_CASES: Array<[string, string, string]> = [
  ['fidel', 'f!del', '****'],
  ['fidel', 'fi_del', '****'],
  ['fidel', 'fid-el', '****'],
  ['fidel', 'f i d e l no more', '**** no more'],
  ['finder', 'fi-nder', '****'],
  ['restricted', 'r3st_ricted', '****'],
  ['calm', 'c!lm', '****'],
  ['finder', 'finder-updates', '****-updates'],
  ['fidel', 'f-del', '****'],
  ['fidel', 'f-del no more', '**** no more'],
  ['fidel', 'f,del', '****'],
  ['finder', 'fi*nder', '****'],
  ['finder', 'fi?*nder', '****'],
  ['finder', "fi^'*nder", '****'],
];

describe('cerberus pipeline (migrated banned-words.bll validation)', () => {
  beforeEach(() => resetCerberus());
  afterEach(() => resetCerberus());

  it.each(VALIDATION_CASES)(
    'validates banned word %s and input %s correctly',
    async (word, input, expectedText) => {
      initCerberus({
        strategies: [
          levenshtein({ bannedWords: [word] }),
          glin({ customWords: [word], language: 'spanish' }),
        ],
      });
      const result = await getCerberus().check(input);
      expect(result.processedText).toBe(expectedText);
      expect(result.containsProfanity).toBe(true);
      expect(result.removed.map((r) => r.matched)).toContain(word);
    },
  );

  it('sanitizes multiple custom words without merging normal words', async () => {
    const words = ['fidel', 'forbidden', 'restricted', 'finder', 'updates'];
    initCerberus({
      strategies: [
        levenshtein({ bannedWords: words }),
        glin({ customWords: words, language: 'english' }),
      ],
    });
    const result = await getCerberus().check(
      'test fid_el fid-el f.del test text forbidden r3st_ricted fi.nder&up.dates/r3st_ricted',
    );
    expect(result.processedText).toBe('test **** **** **** test text **** **** ****&****/****');
    expect(result.containsProfanity).toBe(true);
    expect(result.removed.map((r) => r.matched)).toEqual(expect.arrayContaining(words));
  });

  it('returns safe text unchanged when nothing is removed', async () => {
    initCerberus({
      strategies: [
        levenshtein({ bannedWords: ['fidel'] }),
        glin({ customWords: ['fidel'], language: 'english' }),
      ],
    });
    const input = 'a perfectly safe message';
    const result = await getCerberus().check(input);
    expect(result).toEqual({ processedText: input, removed: [], containsProfanity: false });
  });

  it('skips the remaining strategies when the text is already all asterisks', async () => {
    const lev = levenshtein({ bannedWords: ['fidel'] });
    const gl = glin({ customWords: ['fidel'], language: 'spanish' });
    const glinSpy = vi.spyOn(gl, 'check');
    initCerberus({ strategies: [lev, gl] });
    const result = await getCerberus().check('f!del');
    expect(result.processedText).toBe('****');
    expect(result.removed).toEqual([{ written: 'f!del', matched: 'fidel' }]);
    expect(glinSpy).not.toHaveBeenCalled();
  });

  it('merges removed from both strategies with dedupe by written', async () => {
    initCerberus({
      strategies: [
        levenshtein({ bannedWords: ['fidel', 'fuck'] }),
        glin({ customWords: ['fidel', 'fuck'], language: 'english' }),
      ],
    });
    const result = await getCerberus().check('f!del and f4ck');
    expect(result.containsProfanity).toBe(true);
    expect(result.removed).toEqual([
      { written: 'f!del', matched: 'fidel' },
      { written: 'f4ck', matched: expect.any(String) },
    ]);
  });
});
