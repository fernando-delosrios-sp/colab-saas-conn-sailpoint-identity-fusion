## Context

The test stack currently runs 77 test files (plus fixture/harness files that are not tests themselves) under Jest 29, transformed by `ts-jest` for `.ts` and `babel-jest` for `.js` and node_modules. The TypeScript compiler is invoked per-file even with `isolatedModules: true`, and babel-jest must transform `double-metaphone` and `uuid` (ESM-only) inside every worker because Jest's default behavior is to not transform `node_modules/`.

The dominant mock pattern in this codebase is dependency injection by fake object: `harness/mockRegistry.ts:24` and `harness/registryMocking.ts:5` return objects whose methods are `jest.fn()`s. These are plain runtime values, not module-level mocks, and are already API-compatible with Vitest (a `vi.fn()` is a drop-in replacement for a `jest.fn()`).

Module-level `jest.mock()` is concentrated in 7 files:

- `src/__tests__/index.test.ts` (13 module mocks — highest concentration)
- `src/operations/__tests__/account{Read,Create,Update,Enable,Disable}.test.ts` (one factory each)
- `src/operations/__tests__/chain/chain.replay.test.ts` (one factory)

All factory mocks are pure inline functions; none reference outer-scope variables, which avoids the hoisting footgun in `vi.mock()`. The `jest.mock('@sailpoint/connector-sdk')` auto-mock at `index.test.ts:16` is the one pattern that needs an explicit factory in Vitest (which auto-mocks by attempting to load the real module).

The chain framework file `src/operations/__tests__/chain/framework/ChainContext.ts` contains 9 `jest.Mock` type annotations, which translate to `Mock` from `vitest`.

`babel.config.cjs` is used by both Jest (for `transformIgnorePatterns`) and `ncc` (for bundling `double-metaphone` and `uuid` into `dist/`). The latter is load-bearing for the production build, so the file must be retained even after Jest is removed.

### Topology (before / after)

```
BEFORE                                              AFTER
──────                                              ─────
┌─ Test environment ─────────┐    ┌─ Test environment ─────────┐
│ src/**/*.test.ts (77)      │    │ src/**/*.test.ts (77)      │
│        │                   │    │        │                   │
│        ▼                   │    │        ▼                   │
│ ┌─────────────┐            │    │ ┌─────────────┐            │
│ │   jest 29   │            │    │ │  vitest     │            │
│ │ workers=50% │            │    │ │ pool:threads│  ◀─ shared  │
│ │ timeout=180s│            │    │ │ timeout=180s│    module   │
│ └──────┬──────┘            │    │ │ coverage:v8 │    graph    │
│        │                   │    │ └──────┬──────┘            │
│   ┌────┴────┐              │    │        │                   │
│   │         │              │    │        ▼                   │
│ ts-jest  babel-jest        │    │   esbuild (native)         │
│   │         │              │    │   no transform of          │
│   │         ▼              │    │   node_modules             │
│   │    babel.config.cjs    │    └────────────────────────────┘
│   │    transformIgnore:    │
│   │    double-metaphone,   │    ┌─ Build environment ────────┐
│   │    uuid                │    │ ┌─────────────┐            │
│   └────────────────────────┘    │ │    ncc      │            │
└─────────────────────────────────┘ │ └──────┬──────┘            │
                                    │        │                   │
┌─ Build environment ────────┐    │        ▼                   │
│ ┌─────────────┐            │    │   babel.config.cjs ◀─ KEPT │
│ │    ncc      │            │    │   (transformIgnore:        │
│ └──────┬──────┘            │    │    double-metaphone, uuid) │
│        │                   │    └────────────────────────────┘
│        ▼                   │
│   babel.config.cjs ◀─ KEPT │    Memory: bounded by source    │
└────────────────────────────┘    Memory: × workers (SSH drop)  │
```

## Goals / Non-Goals

**Goals:**
- Switch the test runner from Jest to Vitest in a single change.
- Preserve all existing test outcomes; no behavioral changes to test logic.
- Reduce per-run memory footprint and wall-clock time enough to stop SSH drops in AI sessions.
- Keep the production build (`npm run build`) byte-identical (or as close as practical).
- Retire the test-only toolchain: `ts-jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, `@types/jest`.

**Non-Goals:**
- No new public API or capability changes.
- No changes to production code in `src/` (only test files and config).
- No CI test gate (currently absent; would be a separate change).
- No coverage thresholds.
- No `__mocks__/` directory or snapshot infrastructure.
- No `eslint-plugin-jest` rules (none today).

## Decisions

### 1. Test runner: Vitest with `pool: 'threads'`

```ts
// vitest.config.ts (sketch)
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: [
            'src/__tests__/test-config.ts',
            'src/operations/__tests__/fixtures/**',
            'src/operations/__tests__/harness/**',
            'src/operations/__tests__/chain/framework/**',
            'src/operations/__tests__/chain/harness/**',
            'src/operations/__tests__/chain/data/**',
        ],
        environment: 'node',
        testTimeout: 180_000,
        pool: 'threads',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
})
```

`pool: 'threads'` is the explicit fix for the SSH-drop symptom. The `forks` pool spawns a fresh Node process per worker (same as Jest's default) and would not improve memory. The `threads` pool uses Node's `worker_threads`, sharing the module graph across workers, which keeps total memory bounded by the source size rather than multiplied by worker count.

### 2. Module-level mocks: explicit factories

`index.test.ts:16-28` has 3 `jest.mock(path)` calls without factories and 10 with factories. In Vitest, all `vi.mock(path)` calls benefit from an explicit factory because Vitest attempts to load the real module by default. Concretely:

```ts
// before (jest, auto-mock)
jest.mock('@sailpoint/connector-sdk')

// after (vitest, explicit stub factory)
vi.mock('@sailpoint/connector-sdk', () => ({ createConnector: vi.fn() }))
```

For the 10 calls that already have factories, the translation is `jest.mock` → `vi.mock` and `jest.fn` → `vi.fn` inside the factory body. The hoisting rules are equivalent in these specific cases because none of the factories reference outer-scope variables.

For the 6 files in `src/operations/__tests__/` and `chain.replay.test.ts`, the pattern is `jest.mock('../helpers/...', () => ({ /* ... */ }))`. The same translation applies; no factory needs outer-scope state.

### 3. Type annotations

```ts
// before
info: jest.Mock

// after
info: import('vitest').Mock
```

`ChainContext.ts` has 9 such annotations. The `as jest.Mock` casts in `index.test.ts` and the operation test files become `as Mock` from `vitest`. `vi.fn()` returns `Mock` so most assertions in test files do not need explicit casts.

### 4. `tsconfig.test.json` changes

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "moduleResolution": "node",
        "types": ["node"]
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules"]
}
```

The `"jest"` entry is removed because `@types/jest` is uninstalled. `vitest`'s own types are picked up implicitly when `import { vi } from 'vitest'` appears. The test `include` deliberately keeps the `__tests__/` directories so the tsc type checker (when invoked) still validates them — even though the production `tsconfig.json` excludes them.

### 5. `package.json` scripts

```json
{
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
}
```

`vitest run` matches Jest's `npm test` semantics: single pass, exit non-zero on failure. `vitest` (no subcommand) enters watch mode — useful in interactive development. `--coverage` enables the v8 coverage provider configured in the config file.

### 6. `babel.config.cjs` retention

The file is used by `ncc` to transform `double-metaphone` and `uuid` (ESM-only) when bundling `dist/`. Removing it would change the build output. Vitest ignores it (it does not use babel). We retain the file as-is. The comment in the file claims it is jest-only; that comment is wrong and will be updated.

### 7. `eslint.config.mjs`

Drop `'jest.config.js'` from the `ignores` list. Add nothing new (no `eslint-plugin-jest` is in use). The `babel.config.cjs` ignore remains.

## Risks / Trade-offs

- **`vi.mock` hoisting**: factories cannot reference outer-scope variables. All 16 module-mock sites in this repo are pure inline factories, so the rule is satisfied. If a future test needs a factory that references a shared value, `vi.hoisted()` is the escape hatch.
- **`ts-jest` removed with no v8 type-checker for tests**: `ts-jest` performs a partial TypeScript type check (with `isolatedModules: true` it skips cross-file checks anyway). Vitest's esbuild transform is type-erasure only, like `tsc --isolatedModules`. There is no regression — the same type-checker boundary is preserved. A full `tsc --noEmit` pass against `tsconfig.test.json` is available as a future addition.
- **`@vercel/ncc` and `babel.config.cjs` interaction**: ncc reads the project's babel config. Confirmed via diff of `dist/` before/after this change as part of the validation tasks. If `dist/` differs, restore the babel config or pass `--no-babel` to ncc.
- **Coverage provider change**: Jest uses istanbul by default; Vitest defaults to v8. Coverage output (`coverage/`) will be regenerated. No thresholds exist today, so no comparison is needed. Future coverage comparisons will need a clean baseline run.
- **`testPathIgnorePatterns` → `exclude` glob semantics**: Jest's `testPathIgnorePatterns` is a regex array; Vitest's `exclude` is a minimatch glob array. The same set of paths is excluded, but the matching engine differs. Edge cases (symlinks, `__tests__/test-config.ts` if renamed) should be verified.
