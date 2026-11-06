import type { BatteryCase } from '../types';

/**
 * Executable evasion battery — the public contract of the package.
 * Each case declares its OWNER; a composition fails if the owner does not
 * catch the case OR if the non-owner also catches it.
 *
 * `BATTERY_BANNED_WORDS` is the shared source for both strategies in the
 * battery tests: glin receives it as `customWords`, levenshtein as
 * `bannedWords`. (`fuck`/`shit` additionally live in glin's built-in
 * dictionaries, which is what makes the GLIN_ONLY cases work in glin-only
 * mode.)
 */
export const BATTERY_BANNED_WORDS = ['fuck', 'shit', 'fidel', 'palabra', 'prohibida'];

/**
 * Territory owned by glin: standard leetspeak, Unicode homoglyphs, letters
 * separated by spaces. Note: the plan listed `5h1t`, but glin-profanity v4
 * reads `1` as `l` and never matches it at any level; `5h!t` is the same
 * technique (5→s, !→i) and is caught at the default `moderate` level.
 */
export const GLIN_ONLY: BatteryCase[] = [
  { input: 'f4ck', owner: 'glin' },
  { input: '@ss', owner: 'glin' },
  { input: '5h!t', owner: 'glin' },
  { input: 'f u c k', owner: 'glin' },
  { input: 'f\u057dck', owner: 'glin' }, // Unicode homoglyph
];

/** Territory owned by levenshtein: arbitrary char substitution + fill. */
export const LEVENSHTEIN_ONLY: BatteryCase[] = [
  { input: 'f.ck', owner: 'levenshtein' },
  { input: 'f.del', owner: 'levenshtein' },
  { input: 'p.llabra-pr.hibida', owner: 'levenshtein' },
  { input: 'p.llllabra', owner: 'levenshtein' }, // collapsed repeats
];

/** Clean cases that NOBODY may flag (false-positive guard). */
export const CLEAN: BatteryCase[] = [
  { input: 'cl@ss', owner: 'none' },
  { input: 'llave', owner: 'none' },
  { input: 'calle', owner: 'none' },
  { input: 'perro', owner: 'none' },
];

export const BATTERY: BatteryCase[] = [...GLIN_ONLY, ...LEVENSHTEIN_ONLY, ...CLEAN];
