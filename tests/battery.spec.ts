import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BATTERY_BANNED_WORDS,
  CLEAN,
  getCerberus,
  GLIN_ONLY,
  glin,
  initCerberus,
  LEVENSHTEIN_ONLY,
  levenshtein,
  resetCerberus,
} from '../src';

// Executable evasion battery: each case declares its OWNER. A composition
// fails if the owner does not catch the case OR if the non-owner also does.

const lev = () => levenshtein({ bannedWords: BATTERY_BANNED_WORDS });
const gl = () => glin({ customWords: BATTERY_BANNED_WORDS, language: 'english' });

afterEach(() => resetCerberus());

describe('battery — glin only', () => {
  beforeEach(() => {
    resetCerberus();
    initCerberus({ strategies: [gl()] });
  });

  it.each(GLIN_ONLY)('catches its territory: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(true);
  });

  it.each(LEVENSHTEIN_ONLY)('does NOT catch levenshtein territory: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(false);
  });

  it.each(CLEAN)('keeps clean text clean: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(false);
    expect(result.processedText).toBe(input);
  });
});

describe('battery — levenshtein only', () => {
  beforeEach(() => {
    resetCerberus();
    initCerberus({ strategies: [lev()] });
  });

  it.each(LEVENSHTEIN_ONLY)('catches its territory: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(true);
  });

  it('reports written/matched for a compound evasion', async () => {
    const result = await getCerberus().check('p.llabra-pr.hibida');
    expect(result.processedText).toBe('****-****');
    expect(result.removed).toEqual([
      { written: 'p.llabra', matched: 'palabra' },
      { written: 'pr.hibida', matched: 'prohibida' },
    ]);
  });

  it('catches the collapsed-repeats case', async () => {
    const result = await getCerberus().check('p.llllabra');
    expect(result.processedText).toBe('****');
    expect(result.removed).toEqual([{ written: 'p.llllabra', matched: 'palabra' }]);
  });

  it.each(GLIN_ONLY)('does NOT catch glin territory: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(false);
  });

  it.each(CLEAN)('keeps clean text clean: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(false);
    expect(result.processedText).toBe(input);
  });
});

describe('battery — both strategies composed (levenshtein → glin)', () => {
  beforeEach(() => {
    resetCerberus();
    initCerberus({ strategies: [lev(), gl()] });
  });

  it.each([...GLIN_ONLY, ...LEVENSHTEIN_ONLY])('together they catch everything: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(true);
  });

  it.each(CLEAN)('CLEAN is never flagged: $input', async ({ input }) => {
    const result = await getCerberus().check(input);
    expect(result.containsProfanity).toBe(false);
    expect(result.processedText).toBe(input);
  });
});
