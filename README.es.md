# cerberus

Librería propia de filtrado de palabras prohibidas, extraída del módulo `banned-words`.
Dos motores de detección independientes y componibles, expuestos como **singleton** con caché de dos niveles.

- **No conoce bases de datos, repositorios ni HTTP.** Las listas de palabras prohibidas llegan por `config` o mediante un `loader` externo opcional.
- **`glin-profanity` es dependencia dura** de este paquete y se reexporta completa en la subruta **`@pavelbeard/cerberus/glin`** (úsala como si fuera `glin-profanity`).

## Instalación

```bash
npm install @pavelbeard/cerberus
```

## `@pavelbeard/cerberus/glin` — glin-profanity desde cerberus

La subruta `@pavelbeard/cerberus/glin` reexporta la API completa de `glin-profanity` (`Filter`, `ProfanityFilter`, `checkProfanity`, `checkProfanityAsync`, `isWordProfane`, `normalizeLeetspeak`, `normalizeUnicode`, ... y todos sus tipos), además de la factory de strategy `glin` de cerberus:

```typescript
import { Filter, checkProfanity, isWordProfane, glin } from '@pavelbeard/cerberus/glin';

const filter = new Filter({ languages: ['spanish'], detectLeetspeak: true });
filter.isProfane('f4ck');            // true
checkProfanity('f u c k');           // helper standalone
isWordProfane('fuck');               // true

// la misma subruta sirve la strategy para el pipeline compuesto:
initCerberus({ strategies: [levenshtein({ bannedWords: words }), glin({ customWords: words })] });
```

## División de territorio (contrato público)

Cada técnica de evasión pertenece a UN motor. La batería de evasiones (`GLIN_ONLY` / `LEVENSHTEIN_ONLY` / `CLEAN`, exportada desde el paquete) lo fija como contrato ejecutable en `tests/battery.spec.ts`.

| Técnica de evasión | Dueño |
| --- | --- |
| Leetspeak estándar (`f4ck`, `@ss`, `5h!t`) | `glin` |
| Homoglifos Unicode (`fսck`) | `glin` |
| Caracteres separados (`f u c k`) | `glin` |
| Sustitución arbitraria de caracteres (`f.ck`, `f.del`) | `levenshtein` |
| Relleno con ofuscación (`p.llllabra`, colapsado de repetidos) | `levenshtein` |
| Palabras custom de la entidad | ambas (misma lista compartida) |

La división se sostiene con una **misma lista compartida**: el scanner de levenshtein solo se activa en tokens que contienen un carácter de `CHARACTER_LIST` (puntuación/símbolos de ofuscación; dígitos, `@` y homoglifos quedan fuera a propósito), de modo que `f4ck`/`@ss`/`5h1t` nunca entran en levenshtein y `f.ck` nunca lo caza glin. Verificado con tests por composición.

## Uso — singleton

```typescript
import { initCerberus, getCerberus, resetCerberus, levenshtein, glin } from '@pavelbeard/cerberus';

// 1) Inicializa UNA vez por proceso
initCerberus({
  strategies: [
    levenshtein({ bannedWords: ['palabra', 'prohibida', 'fidel'] }), // motor propio, primero (rewriter conservador)
    glin({ customWords: ['palabra', 'prohibida', 'fidel'], language: 'spanish' }), // diccionario + leetspeak después
  ],
  // loader: opcional — la app decide cómo cargar palabras para cada loaderOptions
  // loader: async (loaderOptions) => repo.getBannedWords(loaderOptions),
  maxCacheSize: 1024, // LRU de resultados (default 1024)
  cacheResults: true, // default true
});

// 2) Úsalo desde cualquier sitio
const result = await getCerberus().check('esto es p.llabra prohibida');
// { processedText: 'esto es **** ****', removed: [{ written: 'p.llabra', matched: 'palabra' }, ...], containsProfanity: true }

// 3) resetCerberus() — SOLO para tests: tira el singleton y ambas cachés
```

Semántica del singleton:

- `initCerberus(config)` es **idempotente** con la misma config (comparación estructural; el `loader` por referencia): devuelve la instancia existente. Con config **distinta lanza error** y exige `resetCerberus()` antes (decisión documentada: error en vez de reinicio silencioso).
- `getCerberus()` lanza error claro si no está inicializado.
- `resetCerberus()` limpia los dos niveles de caché (instancias por `loaderOptions` y resultados).
- No hay forma de crear instancias paralelas desde la API pública.

### Config dinámica con `CerberusBuilder` (además del singleton)

Si la configuración no es fija para todo el proceso — p. ej. un backend donde cada tenant/petición trae su propia config — usa `CerberusBuilder`. Cada `build()` devuelve una instancia **independiente** con sus propias cachés de dos niveles; nada se comparte con el singleton ni entre instancias:

```typescript
import { CerberusBuilder, levenshtein, glin } from '@pavelbeard/cerberus';

// config 100% dinámica por llamada
const instance = new CerberusBuilder(dynamicConfigFromDbOrRequest).build();
await instance.check('texto', 'opciones-42');

// builder reutilizable con loader (cada build() es independiente)
const builder = new CerberusBuilder()
  .withStrategies([levenshtein({ bannedWords: [] }), glin({ customWords: [] })])
  .withLoader(async (loaderOptions) => loadWordsFor(loaderOptions)) // la app decide cómo cargar
  .withCacheResults(true)
  .withMaxCacheSize(5000);

const tenantA = builder.build();
const tenantB = builder.withStrategies([levenshtein({ bannedWords: otherWords })]).build();
// tenantA y tenantB tienen cachés aisladas y composiciones distintas
```

Métodos fluidos: `withConfig(partial)`, `withStrategies([...])`, `addStrategy(s)` (el orden es semántico), `withLoader(fn)`, `withCacheResults(bool)`, `withMaxCacheSize(n)`, `getConfig()`, `build()`. `build()` sin strategies lanza error claro.

| | Singleton | `CerberusBuilder` |
| --- | --- | --- |
| API | `initCerberus` / `getCerberus` / `resetCerberus` | `new CerberusBuilder(config?).build()` |
| Estado | uno por proceso | una instancia independiente por `build()` |
| Caso de uso | config fija del proceso | config dinámica (backend multi-tenant, por petición) |

### Las tres composiciones (mismo factory, sin código condicional)

```typescript
// glin only
initCerberus({ strategies: [glin({ customWords: words, language: 'spanish' })] });

// levenshtein only
initCerberus({ strategies: [levenshtein({ bannedWords: words })] });

// ambos (orden por defecto recomendado: levenshtein primero, glin después)
initCerberus({ strategies: [levenshtein({ bannedWords: words }), glin({ customWords: words })] });
```

`config.strategies` es un array **ordenado**: la salida de cada strategy es la entrada de la siguiente. Si las estrategias se componen, comparten la misma lista (`customWords` de glin = `bannedWords` de levenshtein) y la factoría mergea `removed` con dedupe por `written`.

### Modo estático vs loader

```typescript
// Estático: listas en config
initCerberus({ strategies: [levenshtein({ bannedWords: words })] });
await getCerberus().check('texto');                 // sin loaderOptions

// Con loader: la app carga por loaderOptions; la factoría cachea instancias por loaderOptions
initCerberus({ strategies: [levenshtein({ bannedWords: [] }), glin({ customWords: [] })], loader });
await getCerberus().check('texto', 'opciones-42');   // resuelve words de 'opciones-42'
getCerberus().invalidate('opciones-42');             // ATÓMICO: tira instancias Y resultados de 'opciones-42'
```

## Contrato común de strategy

```typescript
check(text: string): Promise<{ processedText: string; removed: RemovedWord[]; containsProfanity: boolean }>
// interface RemovedWord { written: string; matched: string }
```

- `written` = texto real que escribió el usuario (extraído del diff original/procesado; en levenshtein, span exacto mapeado al token original).
- `matched` = palabra prohibida contra la que matcheó.
- Cada strategy es un *rewriter conservador*: solo reescribe lo que puede demostrar.

## Caché (toda en la factoría; los módulos no tienen caché interna)

1. **Instancias** por `loaderOptions` (construcción única de strategies; `pendingLoads` deduplica cargas concurrentes).
2. **Resultados**: LRU con `maxCacheSize`; clave = `generación:scope::idComposición::texto` (dos composiciones distintas nunca colisionan para el mismo texto); deduplica validaciones en curso para la misma clave.

`invalidate(loaderOptions)` es atómico: banza una generación nueva y elimina instancias y resultados juntos (los resultados se computaron con la lista vieja). `getStats()` expone `hits/misses/resultCacheSize/instanceCacheSize`.

## Config de las strategies

```typescript
levenshtein({
  bannedWords: string[],            // solo listas externas; sin diccionario interno
  characterList?: string[],         // default CHARACTER_LIST (símbolos de ofuscación; sin dígitos ni @)
  replaceWith?: string,             // default '****'
  maxDistance?: number,             // default 1 — dial agresividad vs falsos positivos
  wordBoundary?: boolean,           // default true — isWordBoundary contextual (mata el Scunthorpe: cl@ss pasa limpio)
})

glin({
  language?: Language,              // default 'english'  (o allLanguages: true)
  customWords?: string[],
  replaceWith?: string,             // default '****'
  leetspeakLevel?: 'basic'|'moderate'|'aggressive', // default 'moderate'
  wordBoundary?: boolean,           // default true (alias de wordBoundaries de glin-profanity)
  detectLeetspeak?: boolean,        // default true
  obfuscation?: ...,                // default 'standard'
  ...resto de FilterConfig de glin-profanity (passthrough)
})
```

Nota sobre defaults de glin (verificado empíricamente con `glin-profanity` v4): con `wordBoundaries: false` el escaneo fuzzy legado marca falsos positivos (`cl@ss` → `cl****`) y no reescribe evasiones separadas (`f u c k`); con `true` + whitelist integrada de v4, `CLEAN` pasa limpio y todo `GLIN_ONLY` se caza y reescribe. El control de fronteras contextual sobre caracteres de ofuscación vive en `FilterLevenshtein.isWordBoundary`.

La strategy `glin` es **passthrough**: además del contrato común expone la API completa de `glin-profanity.Filter` (`isProfane`, `checkProfanity`, `matches`, `clearCache`, `getCacheSize`, `getConfig`, `getWordCount`, `checkProfanityWithMinSeverity`) y la instancia cruda en `rawFilter`. Los tipos de glin se reexportan desde el módulo.

## Batería de evasiones (contrato ejecutable)

```typescript
import { GLIN_ONLY, LEVENSHTEIN_ONLY, CLEAN, BATTERY, BATTERY_BANNED_WORDS } from '@pavelbeard/cerberus';
```

`tests/battery.spec.ts` comprueba por composición: glin-only caza `GLIN_ONLY` y no `LEVENSHTEIN_ONLY`; levenshtein-only al revés; juntos cazan todo; `CLEAN` (`cl@ss`, `llave`, `calle`, `perro`) nunca se marca. (El plan listaba `5h1t`; glin v4 lee `1` como `l` y no lo caza en ningún nivel — se usa `5h!t`, misma técnica leetspeak.)

## Desarrollo

```bash
npm run build   # tsc -p tsconfig.build.json → dist/ con .d.ts
npm test        # vitest run (222 tests: migrados + batería + factory/singleton)
npm run lint    # tsc --noEmit (strict)
```

## Estructura

```
cerberus/
├── src/
│   ├── strategies/
│   │   ├── levenshtein/   # motor propio: FilterLevenshtein (sin caché), levenshteinDistance, normalize, validateNewWord
│   │   └── glin/          # adaptador passthrough sobre glin-profanity + diff para `written`
│   ├── factory/           # createCerberus (2 niveles de caché) + singleton init/get/reset
│   ├── battery/           # GLIN_ONLY / LEVENSHTEIN_ONLY / CLEAN
│   ├── constants/         # CHARACTER_LIST, REPLACE_WITH_DEFAULT, defaults
│   ├── types/             # tipos globales (CerberusConfig, CerberusInstance, Strategy, RemovedWord, ...)
│   ├── glin.ts            # subruta @pavelbeard/cerberus/glin: reexport completo de glin-profanity + factory glin
│   └── index.ts
├── tests/
├── package.json           # name "@pavelbeard/cerberus", dependencies: glin-profanity, exports: { ".", "./glin" }, files: ["dist"]
├── tsconfig.json          # strict
├── tsconfig.build.json
└── README.md
```
