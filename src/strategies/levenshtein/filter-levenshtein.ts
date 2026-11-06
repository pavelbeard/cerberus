import {
  CHARACTER_LIST,
  DEFAULT_MAX_DISTANCE,
  DEFAULT_WORD_BOUNDARY,
  REPLACE_WITH_DEFAULT,
} from '../../constants';
import type {
  FilterLevenshteinOptions,
  NormalizeTokenResult,
  RemovedWord,
  ScannerResult,
} from '../../types';
import { levenshteinDistance } from './levenshtein-distance';

interface ProhibitedMatch {
  start: number;
  end: number;
  bannedWord: string;
}

interface VariantMatch {
  bannedWord: string;
  distance?: number;
  sourceStart: number;
  sourceEnd: number;
}

interface BestMatch {
  length: number;
  bannedWord: string;
  distance: number;
}

/**
 * Filters and scans text for banned words using Levenshtein distance.
 *
 * Migrated from the app's `banned-words.helper.js` WITHOUT any cache member:
 * `cacheResults`, `maxCacheSize`, `cache`, `addToCache`, `getFromCache` and
 * `clearCache` were removed — all caching belongs to the factory
 * (`src/factory/`). The rest of the engine is verbatim.
 */
export class FilterLevenshtein {
  bannedWords: string[];

  characterList: string[];

  replaceWith: string;

  maxDistance: number;

  wordBoundary: boolean;

  constructor({
    bannedWords,
    characterList = CHARACTER_LIST,
    replaceWith = REPLACE_WITH_DEFAULT,
    maxDistance = DEFAULT_MAX_DISTANCE,
    wordBoundary = DEFAULT_WORD_BOUNDARY,
  }: FilterLevenshteinOptions) {
    this.bannedWords = bannedWords;
    this.characterList = characterList;
    this.replaceWith = replaceWith;
    this.maxDistance = maxDistance;
    this.wordBoundary = wordBoundary;
  }

  /**
    Normalize token
    @param token - The token to normalize
    @returns The normalized token
  */
  normalizeToken(token: string): string {
    if (!token) return '';
    if (typeof token !== 'string') return '';

    return this.normalizeTokenWithPositions(token).normalized;
  }

  /**
    Normalize token and return positions of each character
    @param token - The token to normalize
    @returns An object containing the normalized token and positions
  */
  normalizeTokenWithPositions(token: string): NormalizeTokenResult {
    const trimmed = token.trim();
    const normalizedCharacters: string[] = [];
    const positions: number[] = [];
    const leadingWhitespace = token.length - token.trimStart().length;
    for (let index = 0; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (this.characterList.includes(character)) continue;

      const lowerCaseCharacter = character.toLowerCase();
      for (
        let characterIndex = 0;
        characterIndex < lowerCaseCharacter.length;
        characterIndex += 1
      ) {
        normalizedCharacters.push(lowerCaseCharacter[characterIndex]);
        positions.push(leadingWhitespace + index);
      }
    }

    return {
      normalized: normalizedCharacters.join(''),
      positions,
    };
  }

  findProhibitedMatches(normalized: string): ProhibitedMatch[] {
    const matches: ProhibitedMatch[] = [];
    let index = 0;
    while (index < normalized.length) {
      let match: BestMatch | undefined;
      for (const bannedWord of this.bannedWords) {
        const minLength = Math.max(1, bannedWord.length - this.maxDistance);
        const maxLength = Math.min(
          normalized.length - index,
          bannedWord.length + this.maxDistance,
        );
        for (let length = minLength; length <= maxLength; length += 1) {
          const distance = levenshteinDistance(
            normalized.slice(index, index + length),
            bannedWord,
            this.maxDistance,
          );
          if (distance > this.maxDistance) continue;

          if (
            !match
            || distance < match.distance
            || (distance === match.distance && length > match.length)
          ) {
            match = { length, bannedWord, distance };
          }
        }
      }

      if (match) {
        matches.push({
          start: index,
          end: index + match.length,
          bannedWord: match.bannedWord,
        });
        index += match.length;
      } else {
        index += 1;
      }
    }

    return matches;
  }

  /**
   * Check if the match is at a word boundary within the token.
   * A boundary is: the edge of the token, an obfuscation character
   * (`characterList`), or any non-alphanumeric character (accents included).
   *
   * @param token - The token to check for word boundaries
   * @param sourceStart - The start index of the match in the token
   * @param sourceEnd - The end index of the match in the token
   * @returns True if the match is at a word boundary, false otherwise
   */
  isWordBoundary(token: string, sourceStart: number, sourceEnd: number): boolean {
    const charBefore = sourceStart > 0 ? token[sourceStart - 1] : null;
    const charAfter = sourceEnd < token.length ? token[sourceEnd] : null;

    const isBoundary = (ch: string | null): boolean => ch === null
      || this.characterList.includes(ch)
      || !/[a-záéíóúàèìòùâêîôûçñ0-9]/i.test(ch);
    return isBoundary(charBefore) && isBoundary(charAfter);
  }

  collapseRepeats(word: string, positions: number[]): { text: string; positions: number[] } {
    let collapsedWord = '';
    const collapsedPositions: number[] = [];
    for (let i = 0; i < word.length; i += 1) {
      if (i > 0 && word[i] === word[i - 1]) continue;

      collapsedWord += word[i];
      collapsedPositions.push(positions[i]);
    }

    return { text: collapsedWord, positions: collapsedPositions };
  }

  /**
   * Scan the text for prohibited words using Levenshtein distance check.
   * Dedupes matches by `sourceStart-sourceEnd-bannedWord`, sorts them, drops
   * overlapping ones and applies the boundary check at the end.
   *
   * @param text - The text to scan
   * @returns The result object with processedText, profaneWords, removed and containsProfanity
   */
  scanner(text: string): ScannerResult {
    const profaneWords: string[] = [];
    const removed: RemovedWord[] = [];
    const processedText = text
      .split(/\s+/)
      .map((token) => {
        if (!this.characterList.some((character) => token.includes(character))) return token;

        const { normalized, positions } = this.normalizeTokenWithPositions(token);
        const variants = [{ text: normalized, positions }];
        const collapsed = this.collapseRepeats(normalized, positions);
        if (collapsed.text !== normalized) variants.push(collapsed);

        const rawMatches = variants.flatMap(
          ({ text: variantText, positions: variantPositions }) => this.findProhibitedMatches(variantText).map((match) => ({
            bannedWord: match.bannedWord,
            distance: (match as ProhibitedMatch & { distance?: number }).distance,
            sourceStart: variantPositions[match.start],
            sourceEnd: variantPositions[match.end - 1] + 1,
          })),
        );
        const seen = new Set<string>();
        const matches = rawMatches
          .filter(({ sourceStart, sourceEnd, bannedWord }) => {
            const key = `${sourceStart}-${sourceEnd}-${bannedWord}`;
            if (seen.has(key)) return false;

            seen.add(key);
            return true;
          })
          .sort((a, b) => a.sourceStart - b.sourceStart)
          .filter(
            (match, i, arr) => i === 0 || match.sourceStart >= arr[i - 1].sourceEnd,
          )
          .filter((match) => (this.wordBoundary
            ? this.isWordBoundary(token, match.sourceStart, match.sourceEnd)
            : true));
        if (!matches.length) return token;

        matches.forEach(({ bannedWord, sourceStart, sourceEnd }) => {
          profaneWords.push(bannedWord);
          removed.push({ written: token.slice(sourceStart, sourceEnd), matched: bannedWord });
        });
        let sourceCursor = 0;
        const result = matches.reduce((processedToken, match) => {
          const replacement = `${processedToken}${token.slice(sourceCursor, match.sourceStart)}${this.replaceWith}`;
          sourceCursor = match.sourceEnd;
          return replacement;
        }, '');

        return `${result}${token.slice(sourceCursor)}`;
      })
      .join(' ')
      .trim();
    return {
      processedText,
      profaneWords: Array.from(new Set(profaneWords)),
      removed,
      containsProfanity: profaneWords.length > 0,
    };
  }

  /**
    Check if the text contains prohibited words using Levenshtein distance check.
    No internal caching: the factory owns the result cache.

    @param text - The text to scan
    @returns The result object with processedText, profaneWords, removed and containsProfanity
  */
  checkProfanityLevenshtein(text: string): ScannerResult {
    if (!text) return { processedText: '', profaneWords: [], removed: [], containsProfanity: false };
    if (typeof text !== 'string') return { processedText: '', profaneWords: [], removed: [], containsProfanity: false };

    return this.scanner(text);
  }
}
