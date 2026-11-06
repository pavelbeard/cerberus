/**
 * Characters treated as obfuscation separators by the levenshtein strategy.
 *
 * Leetspeak substitutions (digits, `@`) and Unicode homoglyphs are
 * intentionally NOT in this list: that territory belongs to the glin
 * strategy. Because the levenshtein scanner only engages on tokens that
 * contain one of these characters, keeping leetspeak out of the list is what
 * enforces the glin/levenshtein territory split for a shared word list.
 */
export const CHARACTER_LIST: string[] = [
  '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  ':', ';', '<', '=', '>', '?', '¿', '¡', '^', '¨', '´', '`', '[', '\\', ']',
  '{', '}', '|', '~', '_', '€', '·',
];
