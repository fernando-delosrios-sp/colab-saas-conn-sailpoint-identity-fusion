## Why

The current test stack (Jest 29 + ts-jest + babel-jest + babel config) imposes heavy per-run overhead in three layers:

- **ts-jest** compiles every TypeScript file through the TypeScript compiler on every test run, even with `isolatedModules: true`.
- **babel-jest** must transform ESM-only node_modules (`double-metaphone`, `uuid`) inside every worker because Jest's default behavior is to not transform `node_modules/`.
- **Jest's worker model** spawns separate Node processes per worker, each carrying its own TypeScript/Babel toolchain in memory.

In interactive AI sessions — where the test suite is invoked repeatedly and the dev environment shares memory with the agent's tooling — this overhead causes total memory consumption to spike high enough to drop SSH sessions. The fix is to switch to a test runner with native ESM handling, esbuild-based TypeScript transform, and a shared module graph (`pool: 'threads'`).

Vitest's API is largely Jest-compatible, so this is a low-friction runner swap. The dominant pattern in this codebase is factory functions returning objects full of `jest.fn()` (e.g. `src/operations/__tests__/harness/mockRegistry.ts`, `src/operations/__tests__/harness/registryMocking.ts`), which is already vitest-compatible. The 7 files that use module-level `jest.mock()` can be ported with explicit factories. No snapshots, no `__mocks__/` directories, no fake timers, no `eslint-plugin-jest` rules — none of the hard parts of a vitest migration are present.

## What Changes

- Replace Jest with Vitest as the test runner.
- Replace `ts-jest` and `babel-jest` with Vitest's native esbuild-based TypeScript transform.
- Drop the test-side `transformIgnorePatterns` workaround for ESM-only node_modules; Vitest handles them natively.
- Replace module-level `jest.mock()` calls in 7 test files with `vi.mock()` calls using explicit factories.
- Replace `jest.fn()`, `jest.Mock`, `jest.clearAllMocks()`, and `jest.spyOn()` calls across 77 test files and 5 harness/framework files with the corresponding `vi` equivalents.
- Update `tsconfig.test.json` to drop `"jest"` from `"types"`.
- Update `package.json` scripts: `test` runs vitest, plus new `test:watch` and `test:coverage` scripts.
- Remove `jest`, `ts-jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, and `@types/jest` from devDependencies.
- Update `eslint.config.mjs` to drop `jest.config.js` from the `ignores` list.
- Keep `babel.config.cjs` in place — it is also used by `ncc` (the production bundler) to transform ESM-only node_modules inside `dist/`.

## Capabilities

### New Capabilities
- (None)

### Modified Capabilities
- (None)

## Impact

- **Affected code:** All 77 test files under `src/`, the test harness and chain framework files (`src/operations/__tests__/harness/*`, `src/operations/__tests__/chain/framework/*`, `src/operations/__tests__/chain/harness/*`), `src/__tests__/index.test.ts`, plus `jest.config.js`, `babel.config.cjs` (test-side only — see "What Changes"), `tsconfig.test.json`, `package.json`, and `eslint.config.mjs`.
- **Affected behavior:** None. Test outcomes, mocks, and assertions are preserved. Test execution is faster and uses less memory.
- **Risk surface:** Concentrated in the 7 files that use module-level `jest.mock()` (notably `src/__tests__/index.test.ts` with 13 module mocks) and in the 9 `jest.Mock` type annotations in `src/operations/__tests__/chain/framework/ChainContext.ts`. All other files use only `jest.fn()` and its variants, which translate mechanically to `vi.fn()`.
- **Out of scope:** Production build behavior is unchanged. The `ncc` build step continues to use `babel.config.cjs` for ESM-only node_modules in the bundle. No CI test gate is added (currently absent). No coverage thresholds are introduced.
