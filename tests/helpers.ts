import { CHARACTER_LIST } from '../src/constants';
import { FilterLevenshtein } from '../src/strategies/levenshtein';
import type { FilterLevenshteinOptions } from '../src/types';

// Test constants (the app's enum values, defined as library constants).
export { CHARACTER_LIST };
export const REPLACE_WITH_DEFAULT = '****';

export const BANNED_WORDS = [
  'test',
  'fate',
  'finder',
  'fidel',
  'restricted',
  'updates',
  'ass',
  'palabra',
];

export function buildFilter(overrides: Partial<FilterLevenshteinOptions> = {}): FilterLevenshtein {
  return new FilterLevenshtein({
    bannedWords: BANNED_WORDS,
    characterList: CHARACTER_LIST,
    replaceWith: REPLACE_WITH_DEFAULT,
    ...overrides,
  });
}
