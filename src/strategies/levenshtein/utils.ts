import { CHARACTER_LIST } from '../../constants';

/** Lowercases and trims a string; non-string values pass through untouched. */
export function normalize<T>(word: T): T | string {
  return typeof word === 'string' ? word.toLowerCase().trim() : word;
}

/**
 * A new banned word is invalid when it is not a non-empty string, contains
 * whitespace or digits, or contains an obfuscation character.
 */
export function validateNewWord(word: unknown, characterList: string[] = CHARACTER_LIST): boolean {
  return (
    typeof word !== 'string'
    || word.length === 0
    || /\s|\d+/.test(word)
    || characterList.some((character) => word.includes(character))
  );
}
