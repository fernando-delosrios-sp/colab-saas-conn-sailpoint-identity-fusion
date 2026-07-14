## 1. Snapshot the build (precondition)

- [x] 1.1 Run `npm ci` to ensure a clean `node_modules`.
- [x] 1.2 Run `npm run build`; capture `dist/` checksum (`find dist -type f -exec sha256sum {} + | sort > /tmp/dist-before.sha256`).
- [x] 1.3 Run `npm test`; record pass/fail counts as the baseline.

## 2. Add Vitest and drop the Jest toolchain

- [x] 2.1 `npm install --save-dev vitest @vitest/coverage-v8`.
- [x] 2.2 `npm uninstall jest ts-jest babel-jest @babel/core @babel/preset-env @types/jest`.
- [x] 2.3 Delete `jest.config.js`.

## 3. Author `vitest.config.ts`

- [x] 3.1 Create `vitest.config.ts` at the repo root matching the design (include/exclude patterns, `environment: 'node'`, `testTimeout: 180_000`, `pool: 'threads'`, `coverage.provider: 'v8'`).
- [x] 3.2 Verify the exclude globs match the previous `testPathIgnorePatterns` set.

## 4. Update `tsconfig.test.json`

- [x] 4.1 Change `"types": ["jest", "node"]` to `"types": ["node"]`.
- [x] 4.2 Run `npx tsc -p tsconfig.test.json --noEmit`; resolve any type errors before continuing.

## 5. Migrate `ChainContext.ts` type annotations

- [x] 5.1 Replace the 8 `jest.Mock` annotations with `Mock` (from `vitest/globals`).

## 6. Migrate harness and chain framework files

- [x] 6.1 In `src/operations/__tests__/harness/mockRegistry.ts`, `registryMocking.ts`, `chain/harness/fakeApiAdapter.ts`, `chain/harness/ReplayAdapter.ts`, replace `jest.fn(` → `vi.fn(` and update the corresponding import (`import { vi } from 'vitest'`).
- [x] 6.2 In `src/operations/__tests__/chain/framework/{ChainState,ChainRunner,ChainContext}.ts`, replace `jest.fn(` and `jest.Mock` with the vitest equivalents.
- [x] 6.3 Verify no `jest.*` references remain in any harness or framework file (`grep -rnE 'jest\.' src/operations/__tests__/harness src/operations/__tests__/chain`).

## 7. Migrate module-mock test files

- [x] 7.1 In `src/__tests__/index.test.ts`, convert the 3 auto-mocks (`jest.mock('@sailpoint/connector-sdk')`, `jest.mock('../data/config')`, `jest.mock('../utils/operationHandler')`) to `vi.mock(path, () => ({ ... }))` with explicit factory bodies.
- [x] 7.2 In the same file, convert the 10 factory mocks from `jest.mock` → `vi.mock` and `jest.fn` → `vi.fn`.
- [x] 7.3 Convert the 6 remaining files (`operations/__tests__/account{Read,Create,Update,Enable,Disable}.test.ts`, `operations/__tests__/chain/chain.replay.test.ts`) by replacing `jest.mock` → `vi.mock` and `jest.fn` → `vi.fn` inside factory bodies.
- [x] 7.4 Replace `as jest.Mock` casts with `as Mock` from `vitest` across all 7 files.
- [x] 7.5 Run the 7 affected tests individually; ensure parity with the pre-change baseline.

## 8. Bulk sweep the remaining test files

- [x] 8.1 In every `*.test.ts` under `src/`, replace `jest.fn(` → `vi.fn(`, `jest.clearAllMocks(` → `vi.clearAllMocks(`, `jest.resetAllMocks(` → `vi.resetAllMocks(`, `jest.spyOn(` → `vi.spyOn(`, `as jest.Mock` → `as Mock`.
- [x] 8.2 `vi` is exposed as a global via `globals: true` in `vitest.config.ts` and `vitest/globals` in `tsconfig.test.json` types, so no per-file `import { vi } from 'vitest'` is required.
- [x] 8.3 Grep the tree to confirm zero residual `jest.` references in `src/**/*.test.ts`.

## 9. Update `package.json` scripts and `eslint.config.mjs`

- [ ] 9.1 Replace `"test": "jest --passWithNoTests --maxWorkers=50%"` with `"test": "vitest run"`. Add `"test:watch": "vitest"` and `"test:coverage": "vitest run --coverage"`.
- [ ] 9.2 In `eslint.config.mjs`, remove `'jest.config.js'` from the `ignores` list. Verify the file still lints clean.

## 10. Update `babel.config.cjs` comment

- [ ] 10.1 Replace the misleading comment ("Used by Jest to transform ESM-only node_modules...") with an accurate one: the file is consumed by `ncc` during the production build to transform `double-metaphone` and `uuid` inside `dist/`.

## 11. Validation

- [ ] 11.1 Run `npm test`; confirm all 77 test files pass with the same pass count as the baseline.
- [ ] 11.2 Run `npm run build`; capture `dist/` checksum and diff against `/tmp/dist-before.sha256`. If files differ, investigate ncc/babel interaction.
- [ ] 11.3 Run `npm run lint`; ensure no lint regressions.
- [ ] 11.4 (Optional) Run `npm run test:coverage`; confirm the v8 coverage report generates under `coverage/`.
- [ ] 11.5 (Manual) Run the test suite inside a memory-constrained shell (e.g. `systemd-run --scope -p MemoryMax=2G npm test`) to confirm the SSH-drop symptom is gone or markedly reduced.
