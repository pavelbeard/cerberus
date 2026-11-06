# cerberus

> Spanish version: [README.md](./README.es.md)

Own profanity-filter library, extracted from the `banned-words` module.
Two independent, composable detection engines, exposed as a **singleton** with two-level caching.

- **It knows nothing about databases, repositories or HTTP.** Banned-word lists arrive via `config` or through an optional external `loader`.
- **`glin-profanity` is a hard dependency** of this package and is fully re-exported at the **`cerberus/glin`** subpath (use it as if it were `glin-profanity` itself).

## Installation

```bash
npm install cerberus   # glin-profanity already comes as a dependency
```

## `cerberus/glin` — glin-profanity from cerberus

The `cerberus/glin` subpath re-exports the complete `glin-profanity` API (`Filter`, `ProfanityFilter`, `checkProfanity`, `checkProfanityAsync`, `isWordProfane`, `normalizeLeetspeak`, `normalizeUnicode`, ... and all its types), plus cerberus' own `glin` strategy factory:

```typescript
import { Filter, checkProfanity, isWordProfane, glin } from 'cerberus/glin';

const filter = new Filter({ languages: ['spanish'], detectLeetspeak: true });
filter.isProfane('f4ck');            // true
checkProfanity('f u c k');           // standalone helper
isWordProfane('fuck');               // true

// the same subpath provides the strategy for the composed pipeline:
initCerberus({ strategies: [levenshtein({ bannedWords: words }), glin({ customWords: words })] });
```

## Territory split (public contract)

Each evasion technique belongs to ONE engine. The evasion battery (`GLIN_ONLY` / `LEVENSHTEIN_ONLY` / `CLEAN`, exported from the package) pins this down as an executable contract in `tests/battery.spec.ts`.

| Evasion technique | Owner |
| --- | --- |
| Standard leetspeak (`f4ck`, `@ss`, `5h!t`) | `glin` |
| Unicode homoglyphs (`fսck`) | `glin` |
| Spaced-out letters (`f u c k`) | `glin` |
| Arbitrary character substitution (`f.ck`, `f.del`) | `levenshtein` |
| Fill with obfuscation (`p.llllabra`, collapsed repeats) | `levenshtein` |
| Custom entity words | both (same shared list) |

The split holds with a **single shared list**: the levenshtein scanner only engages on tokens containing a `CHARACTER_LIST` character (obfuscation punctuation/symbols; digits, `@` and homoglyphs are deliberately excluded), so `f4ck`/`@ss`/`5h!t` never reach levenshtein and `f.ck` is never caught by glin. Verified with per-composition tests.

## Usage — singleton

```typescript
import { initCerberus, getCerberus, resetCerberus, levenshtein, glin } from 'cerberus';

// 1) Initialize ONCE per process
initCerberus({
  strategies: [
    levenshtein({ bannedWords: ['palabra', 'prohibida', 'fidel'] }), // own engine, first (conservative rewriter)
    glin({ customWords: ['palabra', 'prohibida', 'fidel'], language: 'spanish' }), // dictionary + leetspeak after
  ],
  // loader: optional — the app decides how to load words per cacheKey
  // loader: async (cacheKey) => repo.getBannedWords(cacheKey),
  maxCacheSize: 1024, // results LRU (default 1024)
  cacheResults: true, // default true
});

// 2) Use it from anywhere
const result = await getCerberus().check('esto es p.llabra prohibida');
// { processedText: 'esto es **** ****', removed: [{ written: 'p.llabra', matched: 'palabra' }, ...], containsProfanity: true }

// 3) resetCerberus() — TESTS ONLY: drops the singleton and both caches
```

Singleton semantics:

- `initCerberus(config)` is **idempotent** with the same config (structural comparison; `loader` by reference): it returns the existing instance. With a **different config it throws** and requires `resetCerberus()` first (documented choice: error instead of silent re-init).
- `getCerberus()` throws a clear error if not initialized.
- `resetCerberus()` clears both cache levels (instances per `cacheKey` and results).
- There is no way to create parallel instances from the public API.

### Dynamic configuration with `CerberusBuilder` (alongside the singleton)

If the configuration is not fixed for the whole process — e.g. a backend where each tenant/request brings its own config — use `CerberusBuilder`. Each `build()` returns an **independent** instance with its own two-level caches; nothing is shared with the singleton or between instances:

```typescript
import { CerberusBuilder, levenshtein, glin } from 'cerberus';

// 100% dynamic config per call
const instance = new CerberusBuilder(dynamicConfigFromDbOrRequest).build();
await instance.check('text', 'options-42');

// reusable builder with a loader (each build() is independent)
const builder = new CerberusBuilder()
  .withStrategies([levenshtein({ bannedWords: [] }), glin({ customWords: [] })])
  .withLoader(async (cacheKey) => loadWordsFor(cacheKey)) // the app decides how to load
  .withCacheResults(true)
  .withMaxCacheSize(5000);

const tenantA = builder.build();
const tenantB = builder.withStrategies([levenshtein({ bannedWords: otherWords })]).build();
// tenantA and tenantB have isolated caches and different compositions
```

Fluent methods: `withConfig(partial)`, `withStrategies([...])`, `addStrategy(s)` (order is semantic), `withLoader(fn)`, `withCacheResults(bool)`, `withMaxCacheSize(n)`, `getConfig()`, `build()`. `build()` without strategies throws a clear error.

| | Singleton | `CerberusBuilder` |
| --- | --- | --- |
| API | `initCerberus` / `getCerberus` / `resetCerberus` | `new CerberusBuilder(config?).build()` |
| State | one per process | one independent instance per `build()` |
| Use case | fixed process config | dynamic config (multi-tenant backend, per request) |

### The three compositions (same factory, no conditional code)

```typescript
// glin only
initCerberus({ strategies: [glin({ customWords: words, language: 'spanish' })] });

// levenshtein only
initCerberus({ strategies: [levenshtein({ bannedWords: words })] });

// both (recommended default order: levenshtein first, glin after)
initCerberus({ strategies: [levenshtein({ bannedWords: words }), glin({ customWords: words })] });
```

`config.strategies` is an **ordered** array: the output of each strategy is the input of the next. When strategies are composed they share the same list (glin's `customWords` = levenshtein's `bannedWords`) and the factory merges `removed` with dedupe by `written`.

### Static mode vs loader

```typescript
// Static: lists in config
initCerberus({ strategies: [levenshtein({ bannedWords: words })] });
await getCerberus().check('text');                 // no cacheKey

// With loader: the app loads per cacheKey; the factory caches instances per cacheKey
initCerberus({ strategies: [levenshtein({ bannedWords: [] }), glin({ customWords: [] })], loader });
await getCerberus().check('text', 'options-42');   // resolves words of 'options-42'
getCerberus().invalidate('options-42');             // ATOMIC: drops instances AND results of 'options-42'
```

## Common strategy contract

```typescript
check(text: string): Promise<{ processedText: string; removed: RemovedWord[]; containsProfanity: boolean }>
// interface RemovedWord { written: string; matched: string }
```

- `written` = the real text the user typed (extracted from the original/processed diff; in levenshtein, the exact span mapped back to the original token).
- `matched` = the banned word it matched against.
- Each strategy is a *conservative rewriter*: it only rewrites what it can prove.

## Caching (all in the factory; the modules have no internal cache)

1. **Instances** per `cacheKey` (built once; `pendingLoads` deduplicates concurrent loads).
2. **Results**: LRU with `maxCacheSize`; key = `generation:scope::compositionId::text` (two different compositions never collide for the same text); deduplicates in-flight validations for the same key.

`invalidate(cacheKey)` is atomic: it bumps a generation and removes instances and results together (results were computed with the old list). `getStats()` exposes `hits/misses/resultCacheSize/instanceCacheSize`.

## Strategy configuration

```typescript
levenshtein({
  bannedWords: string[],            // external lists only; no internal dictionary
  characterList?: string[],         // default CHARACTER_LIST (obfuscation symbols; no digits or @)
  replaceWith?: string,             // default '****'
  maxDistance?: number,             // default 1 — aggressiveness dial vs false positives
  wordBoundary?: boolean,           // default true — contextual isWordBoundary (kills Scunthorpe: cl@ss passes clean)
})

glin({
  language?: Language,              // default 'english'  (or allLanguages: true)
  customWords?: string[],
  replaceWith?: string,             // default '****'
  leetspeakLevel?: 'basic'|'moderate'|'aggressive', // default 'moderate'
  wordBoundary?: boolean,           // default true (alias of glin-profanity's wordBoundaries)
  detectLeetspeak?: boolean,        // default true
  obfuscation?: ...,                // default 'standard'
  ...rest of glin-profanity's FilterConfig (passthrough)
})
```

Note on glin defaults (verified empirically with `glin-profanity` v4): with `wordBoundaries: false` the legacy fuzzy scan produces false positives (`cl@ss` → `cl****`) and does not rewrite spaced-out evasions (`f u c k`); with `true` plus v4's built-in whitelist, `CLEAN` passes clean and all of `GLIN_ONLY` is caught and rewritten. Contextual boundary control over obfuscation characters lives in `FilterLevenshtein.isWordBoundary`.

The `glin` strategy is a **passthrough**: besides the common contract it exposes the full `glin-profanity.Filter` API (`isProfane`, `checkProfanity`, `matches`, `clearCache`, `getCacheSize`, `getConfig`, `getWordCount`, `checkProfanityWithMinSeverity`) and the raw instance via `rawFilter`. glin's types are re-exported from the module.

## Evasion battery (executable contract)

```typescript
import { GLIN_ONLY, LEVENSHTEIN_ONLY, CLEAN, BATTERY, BATTERY_BANNED_WORDS } from 'cerberus';
```

`tests/battery.spec.ts` checks per composition: glin-only catches `GLIN_ONLY` and not `LEVENSHTEIN_ONLY`; levenshtein-only the other way around; together they catch everything; `CLEAN` (`cl@ss`, `llave`, `calle`, `perro`) is never flagged. (The plan listed `5h1t`; glin v4 reads `1` as `l` and never catches it at any level — `5h!t` is used instead, same leetspeak technique.)

## Development

```bash
npm run build   # tsc -p tsconfig.build.json → dist/ with .d.ts
npm test        # vitest run (233 tests: migrated + battery + factory/singleton/builder)
npm run lint    # tsc --noEmit (strict)
```

## Structure

```
cerberus/
├── src/
│   ├── strategies/
│   │   ├── levenshtein/   # own engine: FilterLevenshtein (no cache), levenshteinDistance, normalize, validateNewWord
│   │   └── glin/          # passthrough adapter over glin-profanity + diff for `written`
│   ├── factory/           # CerberusBuilder, createCerberus (2 cache levels), singleton init/get/reset
│   ├── battery/           # GLIN_ONLY / LEVENSHTEIN_ONLY / CLEAN
│   ├── constants/         # CHARACTER_LIST, REPLACE_WITH_DEFAULT, defaults
│   ├── types/             # global types (CerberusConfig, CerberusInstance, Strategy, RemovedWord, ...)
│   ├── glin.ts            # subpath cerberus/glin: full glin-profanity re-export + glin factory
│   └── index.ts
├── tests/
├── package.json           # name "cerberus", dependencies: glin-profanity, exports: { ".", "./glin" }, files: ["dist"]
├── tsconfig.json          # strict
├── tsconfig.build.json
├── README.md              # Spanish
└── README.en.md           # English (this file)
```
