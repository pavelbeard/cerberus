import { describe, expect, it } from 'vitest';
import { CHARACTER_LIST } from '../src/constants';
import { FilterLevenshtein, validateNewWord } from '../src/strategies/levenshtein';
import { BANNED_WORDS, buildFilter } from './helpers';

// Migrated verbatim from banned-words.helper.spec.js. The "with cache" block
// of the original spec is NOT here: FilterLevenshtein no longer has cache
// members, so the cache assertion moved to the factory level
// (tests/factory.spec.ts — "second call with the same text hits the factory
// result cache").

const AMBIGUOUS_CASES = [
  {
    input: 'cl@ss undefined',
    expected: 'cl@ss undefined',
  },
];

const CAN_BE_NORMALIZED_CASES = [
  { input: 'text by t.st', expected: 'text by ****' },
  { input: 'fi*del your father', expected: '**** your father' },
  { input: 'fi_nder updates', expected: '**** updates' },
  { input: "fi'nder updates", expected: '**** updates' },
  { input: 'fi^nder updates', expected: '**** updates' },
  { input: 'fi¨nder updates', expected: '**** updates' },
  { input: 'fi?nder updates', expected: '**** updates' },
  { input: 'fi¿nder updates', expected: '**** updates' },
  { input: 'fi%nder updates', expected: '**** updates' },
  { input: 'fi&nder updates', expected: '**** updates' },
  { input: 'fi$nder updates', expected: '**** updates' },
  { input: 'fi€nder updates', expected: '**** updates' },
  { input: 'fi·nder updates', expected: '**** updates' },
  { input: 'fi`nder updates', expected: '**** updates' },
  { input: 'fi´nder updates', expected: '**** updates' },
  { input: 'you are fi.nder ', expected: 'you are ****' },
  { input: 'f-del no more tickets', expected: '**** no more tickets' },
  { input: 'fid+l no more tickets', expected: '**** no more tickets' },
  { input: 'fi*nder you!', expected: '**** you!' },
  { input: 'you are such a fi--nder', expected: 'you are such a ****' },
  { input: 'you are such a fi---nder', expected: 'you are such a ****' },
  { input: 'fi/del no more tickets', expected: '**** no more tickets' },
  { input: 'f/del no more tickets', expected: '**** no more tickets' },
  { input: 'f\\del no more tickets', expected: '**** no more tickets' },
  { input: 'fi,nder updates', expected: '**** updates' },
  { input: 'fi[nder updates', expected: '**** updates' },
  { input: 'finde]r updates', expected: '**** updates' },
  { input: 'fi\\nder updates', expected: '**** updates' },
  { input: 'f[del no more tickets', expected: '**** no more tickets' },
  { input: 'f]del no more tickets', expected: '**** no more tickets' },
  { input: "fid'l no more tickets", expected: '**** no more tickets' },
  { input: 'f/////del no more tickets', expected: '**** no more tickets' },
  { input: 'f/d//el no more tickets', expected: '**** no more tickets' },
  { input: 'f/d\\el no more tickets', expected: '**** no more tickets' },
  { input: 'fi.nder&up.dates/r3st_ricted', expected: '****&****/****' },
  { input: 'fi.nder updates', expected: '**** updates' },
  { input: 'p.llllabra abracadabra', expected: '**** abracadabra' },
];

const WITH_MAX_DISTANCE_GT_1 = [
  {
    input: 'f del no more tickets',
    expected: 'f del no more tickets',
    expectedWithMD2: 'f del no more tickets',
    expectedWithMD3: 'f del no more tickets',
  },
  {
    input: 'f- del no more tickets',
    expected: 'f- del no more tickets',
    expectedWithMD2: 'f- del no more tickets',
    expectedWithMD3: '****- del no more tickets',
  },
  {
    input: 'f-- del no more tickets',
    expected: 'f-- del no more tickets',
    expectedWithMD2: 'f-- del no more tickets',
    expectedWithMD3: '****-- del no more tickets',
  },
  {
    input: 'f\\d//l no more tickets',
    expected: 'f\\d//l no more tickets',
    expectedWithMD2: '**** no more tickets',
    expectedWithMD3: '**** no more tickets',
  },
  {
    input: 'f\\d\\//l no&more_tickets',
    expected: 'f\\d\\//l no&more_tickets',
    expectedWithMD2: '**** no&more_tickets',
    expectedWithMD3: '**** no&more_tickets',
  },
];

describe('levenshtein strategy engine (migrated banned-words.helper.spec)', () => {
  describe('new word validation', () => {
    it.each(CHARACTER_LIST)(
      'rejects a word containing the configured separator %s',
      (character) => {
        expect(validateNewWord(`fi${character}del`)).toBe(true);
      },
    );

    it.each([
      '',
      'fi del',
      'fi\tdel',
      'fi\ndel',
      'fi\rdel',
      'fi\u00a0del',
      null,
      undefined,
      123,
      'word1234',
      '123',
    ])(
      'rejects an empty, whitespace-containing or non-string value: %p',
      (word) => {
        expect(validateNewWord(word)).toBe(true);
      },
    );

    it.each(['fidel', 'TEST', 'café', 'entrepà'])(
      'accepts a non-empty word without whitespace or configured separators: %s',
      (word) => {
        expect(validateNewWord(word)).toBe(false);
      },
    );
  });

  describe('token normalization', () => {
    it.each(CHARACTER_LIST)(
      'removes the literal separator %s, including repetitions',
      (character) => {
        const filter = buildFilter();
        expect(filter.normalizeToken(`fi${character.repeat(3)}del`)).toBe('fidel');
      },
    );

    it('returns an object with normalized and positions properties', () => {
      const filter = buildFilter();
      const result = filter.normalizeTokenWithPositions('f.i.d3l');
      expect(result).toHaveProperty('normalized');
      expect(result).toHaveProperty('positions');
      expect(result.normalized).toBe('fid3l');
      expect(result.positions).toEqual([0, 2, 4, 5, 6]);
    });
  });

  describe('filter', () => {
    it('FilterLevenshtein has NO cache members (caching belongs to the factory)', () => {
      const filter = buildFilter();
      expect('cache' in filter).toBe(false);
      expect('cacheResults' in filter).toBe(false);
      expect('maxCacheSize' in filter).toBe(false);
      expect((filter as unknown as Record<string, unknown>).addToCache).toBeUndefined();
      expect((filter as unknown as Record<string, unknown>).getFromCache).toBeUndefined();
      expect((filter as unknown as Record<string, unknown>).clearCache).toBeUndefined();
    });

    describe('edge cases', () => {
      it('should handle ambiguous cases (cl@ss passes clean — forbidden false positive)', () => {
        const { input, expected } = AMBIGUOUS_CASES[0];
        const { processedText, containsProfanity } = buildFilter().checkProfanityLevenshtein(input);
        expect(processedText).toBe(expected);
        expect(containsProfanity).toBe(false);
      });
    });

    describe('default maxDistance (1)', () => {
      it.each(CAN_BE_NORMALIZED_CASES)(
        'original should be normalized: $input',
        ({ input, expected }) => {
          const { processedText, containsProfanity, profaneWords } = buildFilter().checkProfanityLevenshtein(input);
          expect(processedText).toBe(expected);
          expect(containsProfanity).toBe(profaneWords.length > 0);
          expect(profaneWords.length).toBeGreaterThan(0);
        },
      );
      it.each(WITH_MAX_DISTANCE_GT_1)(
        'original should remain unchanged: $input',
        ({ input, expected }) => {
          const { processedText, containsProfanity, profaneWords } = buildFilter().checkProfanityLevenshtein(input);
          expect(processedText).toBe(expected);
          expect(containsProfanity).toBe(false);
          expect(profaneWords.length).toBe(0);
        },
      );
    });

    describe('with max distance 2', () => {
      it.each(WITH_MAX_DISTANCE_GT_1)(
        'result is $input',
        ({ input, expectedWithMD2 }) => {
          const { processedText } = buildFilter({ maxDistance: 2 }).checkProfanityLevenshtein(input);
          expect(processedText).toBe(expectedWithMD2);
        },
      );
    });

    describe('with max distance 3', () => {
      it.each(WITH_MAX_DISTANCE_GT_1)(
        'result is: $input',
        ({ input, expectedWithMD3 }) => {
          const { processedText } = buildFilter({ maxDistance: 3 }).checkProfanityLevenshtein(input);
          expect(processedText).toBe(expectedWithMD3);
        },
      );
    });

    describe('removed contract', () => {
      it('reports the real written text and the matched banned word', () => {
        const { removed, processedText } = buildFilter().checkProfanityLevenshtein('fi.nder&up.dates/r3st_ricted');
        expect(processedText).toBe('****&****/****');
        expect(removed).toEqual([
          { written: 'fi.nder', matched: 'finder' },
          { written: 'up.dates', matched: 'updates' },
          { written: 'r3st_ricted', matched: 'restricted' },
        ]);
      });

      it('handles empty and non-string input', () => {
        const filter = buildFilter();
        expect(filter.checkProfanityLevenshtein('')).toEqual({
          processedText: '',
          profaneWords: [],
          removed: [],
          containsProfanity: false,
        });
        expect(filter.checkProfanityLevenshtein(undefined as unknown as string).containsProfanity).toBe(false);
      });
    });
  });

  describe('banned words sanity', () => {
    it('uses the shared test word list', () => {
      expect(BANNED_WORDS).toContain('palabra');
      const filter: FilterLevenshtein = buildFilter();
      expect(filter.bannedWords).toEqual(BANNED_WORDS);
    });
  });
});
