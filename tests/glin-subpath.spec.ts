import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as glinSubpath from '../src/glin';

// `cerberus/glin` must be usable exactly like `glin-profanity` itself:
// the full upstream API is re-exported, plus cerberus' glin strategy factory.
describe('subpath cerberus/glin (src/glin.ts)', () => {
  it('re-exports the full glin-profanity runtime API', () => {
    // classes / enums
    expect(typeof glinSubpath.Filter).toBe('function');
    expect(typeof glinSubpath.ProfanityFilter).toBe('function');
    expect(glinSubpath.SeverityLevel).toBeDefined();
    // standalone helpers
    for (const fn of [
      'checkProfanity',
      'checkProfanityAsync',
      'isWordProfane',
      'normalizeLeetspeak',
      'normalizeUnicode',
      'normalizeNFKD',
      'collapseSpacedCharacters',
      'collapseRepeatedCharacters',
      'containsLeetspeak',
      'containsUnicodeObfuscation',
      'convertFullWidth',
      'convertHomoglyphs',
      'detectCharacterSets',
      'generateLeetspeakVariants',
      'removeZeroWidthCharacters',
    ] as const) {
      expect(typeof glinSubpath[fn], fn).toBe('function');
    }
  });

  it('works like glin-profanity: Filter, checkProfanity, isWordProfane', () => {
    const filter = new glinSubpath.Filter({
      languages: ['english', 'spanish'],
      detectLeetspeak: true,
      leetspeakLevel: 'moderate',
    });
    expect(filter.isProfane('f4ck')).toBe(true);
    expect(filter.isProfane('hola')).toBe(false);

    const standalone = glinSubpath.checkProfanity('f u c k', { languages: ['english'], detectLeetspeak: true });
    expect(standalone.containsProfanity).toBe(true);

    expect(glinSubpath.isWordProfane('fuck')).toBe(true);
    expect(glinSubpath.isWordProfane('hello')).toBe(false);
    expect(glinSubpath.normalizeLeetspeak('@ss')).toBe('ass');
  });

  it('also exposes cerberus’ own glin strategy factory', () => {
    expect(typeof glinSubpath.glin).toBe('function');
    expect(typeof glinSubpath.GlinStrategy).toBe('function');
    const strategy = glinSubpath.glin({ customWords: ['fidel'], language: 'spanish' });
    expect(strategy.id).toBe('glin');
    expect(strategy.check('f i d e l').containsProfanity).toBe(true);
  });

  it('package.json exposes the ./glin export and depends on glin-profanity directly', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.exports['./glin']).toEqual({ types: './dist/glin.d.ts', default: './dist/glin.js' });
    expect(pkg.dependencies['glin-profanity']).toBeDefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });
});
