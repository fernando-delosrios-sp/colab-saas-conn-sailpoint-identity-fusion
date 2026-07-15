# Vitest Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Jest → Vitest migration: update the `test` script, drop the stale ESLint ignore, fix the misleading Babel comment, and validate that all 77 test files run clean and the production build is byte-stable.

**Architecture:** The heavy lifting (config files, harness rewrites, mock translations) is already done in sections 1–8 of `tasks.md`. This plan covers only the remaining script/config cleanup (sections 9, 10) and the four validation gates (section 11) needed to declare the change complete. Additionally, a post-validation interop pass (Task 8) addresses regressions uncovered by actually running the suite under Vitest — mostly circular-dependency and ESM-interop issues that Jest's looser CJS evaluation masked.

**Tech Stack:** TypeScript, Node.js, npm, Vitest 4.x, esbuild (built into Vitest), `@vercel/ncc`, ESLint 10.

## Global Constraints

- `vitest` globals (`vi`, `describe`, `it`, `expect`, `Mock`, etc.) are available without imports — `vitest.config.ts` has `globals: true` and `tsconfig.test.json` lists `"vitest/globals"` in `types`.
- `babel.config.cjs` MUST stay in place; ncc reads it to transform `double-metaphone` and `uuid` during `npm run build`. Do not delete it.
- `dist/` MUST be byte-identical (or diff-explained) before/after the script change, because the production bundle is what ships to tenants.
- Zero `jest.*` references in `src/**/*.test.ts` after this plan. The validation gate will fail if any are reintroduced.
- **Vitest ESM interop**: Vitest's module resolution is stricter than Jest's. Module-level `vi.mock` factories are hoisted above top-level variables (`vi.hoisted` is the escape hatch). Default-import mocks must have a populated `default` property. Circular dependencies through `export *` re-exports can leave bindings `undefined` — break cycles by direct-file imports or lightweight assertion helpers. Bash 5 / `find` is available. `systemd-run` may not be available on macOS — task 11.5 has a portable fallback.

---

## Task 1: Update `package.json` test scripts

**Files:**
- Modify: `package.json:29-31` (the `"scripts"` block)

**Interfaces:**
- Consumes: existing `"scripts.test"` = `"jest --passWithNoTests --maxWorkers=50%"`
- Produces: new scripts for `test`, `test:watch`, `test:coverage`

- [ ] **Step 1: Read the current scripts block**

Run: `node -e "console.log(JSON.stringify(require('./package.json').scripts, null, 2))"` (or open `package.json` in the editor).

Confirm the line `"test": "jest --passWithNoTests --maxWorkers=50%"` exists at the `scripts` block (around line 29). If a `test:watch` or `test:coverage` line is already present, skip the corresponding sub-step below.

- [ ] **Step 2: Replace the `test` line and add watch/coverage lines**

Edit `package.json` so the `scripts` block contains exactly these three relevant lines in this order, immediately after `"clean"` (do not reorder unrelated scripts):

```json
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
```

The change is one removed line and two added lines; verify with `git diff package.json` that no other script was touched.

- [ ] **Step 3: Verify the JSON is still valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('ok')"`

Expected: prints `ok`. A parse error means a trailing comma or quote slipped in.

- [ ] **Step 4: Smoke-test the new `test` script**

Run: `npm test -- --reporter=basic --bail=1 2>&1 | head -40`

Expected: vitest starts, runs the first failing test (or all of them if green), and reports the test framework name as "vitest". If the output still says "jest", revert and check that the `scripts.test` line was edited.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: switch npm test script from jest to vitest"
```

---

## Task 2: Drop `jest.config.js` from `eslint.config.mjs` ignores

**Files:**
- Modify: `eslint.config.mjs:8` (the `ignores` array of the global flat config)

**Interfaces:**
- Consumes: existing ignore array `['dist/', 'site/', 'babel.config.cjs', 'jest.config.js']`
- Produces: ignore array without `'jest.config.js'` (it was deleted in task 2.3 of `tasks.md`)

- [ ] **Step 1: Confirm `jest.config.js` is gone**

Run: `ls jest.config.js 2>&1`

Expected: `ls: cannot access 'jest.config.js': No such file or directory`. If the file still exists, stop and revisit task 2.3 of `tasks.md` before continuing.

- [ ] **Step 2: Edit the `ignores` array**

Open `eslint.config.mjs`. The line is:

```js
        ignores: ['dist/', 'site/', 'babel.config.cjs', 'jest.config.js'],
```

Replace it with:

```js
        ignores: ['dist/', 'site/', 'babel.config.cjs'],
```

Verify with `git diff eslint.config.mjs` that the only change is the removal of `, 'jest.config.js'`.

- [ ] **Step 3: Lint the file itself**

Run: `npx eslint eslint.config.mjs 2>&1`

Expected: exit 0, no output. If the linter complains about a missing `globalIgnores` import or similar, that is a pre-existing issue unrelated to this task — note it in the validation task but do not fix it here.

- [ ] **Step 4: Run the full lint to ensure no regression**

Run: `npm run lint 2>&1 | tail -20`

Expected: no new errors attributable to this change. Pre-existing errors (e.g. from `src/operations/__tests__/chain/harness/ReplayAdapter.ts` cognitive complexity, reported in earlier sessions) are not regressions.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: drop jest.config.js from eslint ignores"
```

---

## Task 3: Fix the misleading `babel.config.cjs` comment

**Files:**
- Modify: `babel.config.cjs:1` (the leading `//` comment)

**Interfaces:**
- Consumes: current comment `// Used by Jest to transform ESM-only node_modules (e.g. double-metaphone) to CommonJS`
- Produces: comment that correctly attributes the file to `ncc`'s production build, not Jest

- [ ] **Step 1: Confirm the current comment**

Open `babel.config.cjs`. The full current contents should be:

```js
// Used by Jest to transform ESM-only node_modules (e.g. double-metaphone) to CommonJS
module.exports = {
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
}
```

If the file already has a non-Jest comment, this task is already done — skip to Step 4.

- [ ] **Step 2: Replace the comment**

Replace line 1 with the following two-line comment that reflects reality (ncc reads this to bundle `double-metaphone` and `uuid` into `dist/`):

```js
// Consumed by @vercel/ncc during `npm run build` to transform the ESM-only
// `double-metaphone` and `uuid` node_modules into CommonJS for `dist/`.
```

The `module.exports` line below is unchanged.

- [ ] **Step 3: Verify the file is still a valid CommonJS module**

Run: `node -e "console.log(JSON.stringify(require('./babel.config.cjs')))"`

Expected: prints `{"presets":[["@babel/preset-env",{"targets":{"node":"current"},"modules":"commonjs"}]]}`. A parse error means the file was corrupted — restore from git and retry.

- [ ] **Step 4: Commit**

```bash
git add babel.config.cjs
git commit -m "docs: correct babel.config.cjs comment (ncc, not jest)"
```

---

## Task 4: Validate the test suite under Vitest

**Files:**
- Read only: `package.json` (the new `test` script), `vitest.config.ts`
- Reference: `tasks.md` section 11.1 — baseline = 77 test files passing

**Interfaces:**
- Consumes: `npm test` now invokes `vitest run`
- Produces: confirmation that all 77 test files pass and the count matches the pre-migration baseline (also 77 files / same number of tests)

- [ ] **Step 1: Sweep for residual `jest.*` references in `src/`**

Run: `grep -rnE 'jest\.' src/ --include='*.ts' 2>&1`

Expected: no output. If any line appears (for example, the three `jest.fn(...)` calls in `src/services/attributeService/__tests__/attributeService.test.ts` at lines 148, 149, 155 that were reintroduced by the `add-static-option` change), replace each with `vi.fn(...)` and amend this step before continuing. Each replacement is a mechanical s/jest\.fn/vi.fn/ on those three lines; do not touch any other test.

- [ ] **Step 2: Run the full suite**

Run: `npm test 2>&1 | tail -40`

Expected: all 77 test files pass. Capture the total test count and the number of test files for the validation summary:

```bash
npm test 2>&1 | grep -E 'Test Files|Tests' | tail -4
```

Expected (subject to the `add-static-option` change that landed since the baseline was recorded): `Test Files  77 passed (77)`, `Tests  NNN passed (NNN)`. The `NNN` total is whatever the suite currently has; it must be greater than or equal to the pre-migration baseline (922 by latest count). Any FAIL line is a regression — fix before continuing.

- [ ] **Step 3: If regressions are found, diagnose before fixing**

- If a test fails because of a missing `vi` import, add `import { vi } from 'vitest'` at the top of the file (the global is supposed to be in scope, but some files may not have `"vitest/globals"` in their include path).
- If a test fails because of a `jest.Mock` cast, search the file for `as jest.Mock` and replace with `as Mock` plus `import type { Mock } from 'vitest'`.
- If a test fails because of a `jest.mock` factory that references an outer-scope variable, wrap the variable in `vi.hoisted(() => ...)` and re-thread the factory.
- If a test fails for a different reason, capture the full output and pause for human review — do not guess.

- [ ] **Step 4: Re-run after any fixes**

Repeat Step 2. The suite must be green before this task is complete. Do not commit fixes from this task as a separate commit — fold them into the final validation commit (Task 7).

---

## Task 5: Validate the production build is byte-stable

**Files:**
- Read only: `package.json` (`prebuild` script, which runs `sync-connector-spec-initial-values.cjs`)
- Reference: `/tmp/dist-before.sha256` captured in task 1.2 of `tasks.md` (may need regenerating if lost)

**Interfaces:**
- Consumes: the unchanged source tree plus the new `package.json` scripts
- Produces: a `dist/` tree whose SHA-256 manifest matches the pre-migration baseline, OR a list of files that differ with a one-line explanation per file

- [ ] **Step 1: Confirm the baseline manifest exists**

Run: `ls -la /tmp/dist-before.sha256 2>&1`

Expected: file exists and is non-empty. If the file is missing (reboot, /tmp cleanup), regenerate the *current* baseline as a one-time exception:

```bash
npm run build
find dist -type f -exec sha256sum {} + | sort > /tmp/dist-current-only.sha256
```

Then run the full validation pass against this temporary baseline and flag the validation as "baseline regenerated mid-migration" in the change log.

- [ ] **Step 2: Rebuild and capture the post-change manifest**

```bash
npm run build 2>&1 | tail -20
find dist -type f -exec sha256sum {} + | sort > /tmp/dist-after.sha256
```

Expected: build succeeds. `dist-after.sha256` is non-empty.

- [ ] **Step 3: Diff the two manifests**

```bash
diff /tmp/dist-before.sha256 /tmp/dist-after.sha256 > /tmp/dist-diff.txt
cat /tmp/dist-diff.txt
```

Expected: empty diff (the production build is byte-identical). A non-empty diff is a regression — investigate:

- If the diff is purely in timestamps or build IDs (e.g. a `package.json` snapshot inside `dist/` that records the build time), it is harmless. Document it and move on.
- If a source file is in the diff, the `babel.config.cjs` change from Task 3 may have changed the output. Revert that comment (it is doc-only and should not affect ncc behavior) and re-run the build. If the diff disappears, the comment was the cause; if it persists, pause for human review.
- If only `node_modules/` cache manifests differ, run `npm ci` and rebuild.

- [ ] **Step 4: Record the result**

Append to the change's `verify.md` (next artifact) a line under "Build" that says either "byte-identical to baseline" or "diff: <count> files, root cause: <one-line>".

---

## Task 6: Lint, coverage, and memory-pressure validation

**Files:**
- Read only: `package.json` (`lint`, `test:coverage` scripts)
- Reference: `dist-diff.txt` from Task 5

**Interfaces:**
- Consumes: green test suite from Task 4, byte-stable `dist/` from Task 5
- Produces: lint clean, coverage report present, memory-pressure note

- [ ] **Step 1: Run lint**

```bash
npm run lint 2>&1 | tail -30
```

Expected: no new errors. Compare to the pre-migration baseline by running `git stash && npm run lint 2>&1 | tail -30 && git stash pop` if a comparison is needed; the post-migration count must not be higher. Pre-existing errors (e.g. the cognitive-complexity warnings in `ReplayAdapter.ts` and `clientService.ts` noted in earlier sessions) are not regressions.

- [ ] **Step 2: Run coverage (optional but recommended)**

```bash
npm run test:coverage 2>&1 | tail -20
ls coverage/index.html 2>&1
```

Expected: vitest reports coverage percentages and writes `coverage/index.html`. If the script fails because the v8 provider is not loaded, verify `vitest.config.ts` has `coverage.provider: 'v8'` and `@vitest/coverage-v8` is in `devDependencies`.

- [ ] **Step 3: Memory-pressure validation (manual)**

The pre-migration symptom was SSH drops during `npm test` caused by the Jest fork-pool multiplying per-worker memory. Validate the fix:

- On Linux with systemd available:

  ```bash
  systemd-run --scope -p MemoryMax=2G npm test 2>&1 | tail -20
  ```

  Expected: tests complete under the 2 GB cap. Pre-migration this would OOM-kill the worker; post-migration with `pool: 'threads'`, the shared module graph fits.
- On macOS or systems without systemd, use the `time` and `ps` fallback:

  ```bash
  /usr/bin/time -l npm test 2>&1 | grep -E 'maximum resident set size'
  ```

  Expected: peak RSS is materially lower than the pre-migration figure. Record the number in the change's `verify.md`.

- If neither measurement is feasible in the current environment, mark this step as "skipped — environment lacks the tooling" in the verify artifact and link to the manual-run instructions in `README.md` or `docs/`.

- [ ] **Step 4: Commit any test/lint fixes surfaced by this task**

If Step 1 surfaced new lint errors that you fixed, or Step 4 of Task 4 surfaced a `vi` / `Mock` / `vi.hoisted` fix, fold all of those into a single commit:

```bash
git add -A
git commit -m "fix(tests): address vitest migration lint/type fallout"
```

Skip this step if there is nothing to commit.

---

## Task 7: Write the `verify.md` artifact and final commit

**Files:**
- Create: `openspec/changes/migrate-jest-to-vitest/verify.md`

**Interfaces:**
- Consumes: all evidence from Tasks 4, 5, 6
- Produces: a structured `verify.md` that the schema's verification gate can read

- [ ] **Step 1: Gather evidence into a single table**

For each of the three validation gates, capture one line with the command, the result, and any caveats:

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| Tests | `npm test` | `N test files passed, M tests passed` | matches or exceeds pre-migration baseline |
| Build | `npm run build` + sha256 diff | byte-identical / N files differ | one-line cause per differing file |
| Lint | `npm run lint` | exit 0 / pre-existing warnings only | count of pre-existing warnings |
| Coverage | `npm run test:coverage` | `coverage/index.html` present | skip if optional |
| Memory | systemd-run / `/usr/bin/time -l` | peak RSS = X GB | skip if env lacks tooling |

- [ ] **Step 2: Write `verify.md`**

Use the schema's verify template (the CLI emits it via `openspec instructions verify --change "migrate-jest-to-vitest" --json`; fall back to the structure below if the CLI is unavailable):

```markdown
# Vitest Migration — Verification

## Evidence

[Paste the table from Step 1 here.]

## Pass / Fail Summary

- Tests: PASS / FAIL — <one-line reason>
- Build: PASS / FAIL — <one-line reason>
- Lint: PASS / FAIL — <one-line reason>
- Coverage: PASS / SKIP / FAIL — <one-line reason>
- Memory: PASS / SKIP / FAIL — <one-line reason>

## Pre-existing issues (not regressions)

- <bullet each>
```

- [ ] **Step 3: Commit**

```bash
git add openspec/changes/migrate-jest-to-vitest/verify.md
git commit -m "docs(openspec): add verify.md for vitest migration"
```

After this commit, the change is fully applied. Run `/opsx-archive migrate-jest-to-vitest` to land the change on `fernando` and write the retrospective.

---

## Task 8: Fix Vitest interop regressions uncovered by the validation run

When Task 4 (test suite validation) is executed, Vitest's stricter ESM module evaluation exposes several latent issues that Jest's looser CJS interop masked. This task is our interop pass — it runs AFTER the first `npm test` invocation surfaces regressions, and it fixes each regression in the right order (dependency graph from the outside in).

**Root-cause summary:**

- A circular dependency chain exists: `data/config/defaults.ts` → `settings/matchingSettings.ts` → `utils/assert.ts` → `services/serviceRegistry.ts` → `services/clientService` → `constants.ts` → `data/config/defaults.ts`. Jest's CJS evaluate-then-bind semantics resolve this cycle before any top-level value is read. Vitest's ESM live-binding semantics leave bindings `undefined` when accessed before their defining module finishes loading.
- A second cycle exists through `readConfig.ts`: `data/config/index.ts` → `readConfig.ts` → `utils/assert.ts` → … → `constants.ts` → `data/config` (back to index). Same root cause.
- Module-level `vi.mock` factories are unconditionally hoisted in Vitest, so a factory that closes over a top-level `const` (like `mockLogger`) hits a TDZ error. Jest tolerates this because its mock hoisting is weaker.
- Default imports in Vitest correctly resolve to the `default` export. Jest's babel-jest `__esModule` convenience layer gave the importer the whole module object, so mocks with an empty `default: {}` silently worked.

The interop fixes below resolve all four classes of regression.

### 8.1 — Break the `readConfig.ts` → assert → serviceRegistry cycle

**Files:**
- Modify: `src/data/config/readConfig.ts`
- Modify: `src/utils/assert.ts`

**Why:** `readConfig.ts` imported `assert` from `utils/assert` for a single null-guard (`assert(sourceConfig, …)`). That import dragged in `ServiceRegistry`, which dragged in the rest of the connector, creating a cycle through `data/config/index.ts`. Replacing the `assert` call with a direct check breaks the cycle at the simplest edge.

- [ ] **Step 1: In `readConfig.ts`, remove the `assert` import and inline the check**

```typescript
// BEFORE (readConfig.ts:3)
import { assert } from '../../utils/assert'

// at line 38:
assert(sourceConfig, 'Failed to read source configuration')

// AFTER
// (remove the import line entirely)
// at line 38, replace the assert call with:
if (!sourceConfig) {
    throw new Error('Failed to read source configuration')
}
```

Verify with `git diff src/data/config/readConfig.ts` that the only changes are:
1. The `import { assert } from '../../utils/assert'` line is gone.
2. `assert(sourceConfig, …)` is replaced by the `if (!sourceConfig) throw …` block.

- [ ] **Step 2: In `assert.ts`, replace the `require` with a top-level import**

The original `require('../services/serviceRegistry')` inside `tryGetServiceRegistry` was a workaround for the cycle through `readConfig.ts`. With that cycle broken, a simple top-level `import` is safe.

```typescript
// BEFORE (assert.ts)
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'

function tryGetServiceRegistry(): unknown {
    try {
        const { ServiceRegistry } = require('../services/serviceRegistry')
        return ServiceRegistry.getCurrent?.()
    } catch {
        return undefined
    }
}

// AFTER
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'

function tryGetServiceRegistry(): ServiceRegistry | undefined {
    try {
        return ServiceRegistry.getCurrent()
    } catch {
        return undefined
    }
}
```

- [ ] **Step 3: Verify the fix**

```bash
./node_modules/.bin/vitest run src/utils/__tests__/assert.test.ts
```

Expected: all 9 tests pass. If "vi.fn() not called" errors persist, double-check that `readConfig.ts` no longer imports from `utils/assert`.

### 8.2 — Break the `defaults.ts` → settings → assert → serviceRegistry cycle

**Files:**
- Create: `src/data/config/settings/assertLite.ts`
- Modify: `src/data/config/settings/connectionSettings.ts`
- Modify: `src/data/config/settings/developerSettings.ts`
- Modify: `src/data/config/settings/matchingSettings.ts`
- Modify: `src/data/config/settings/reviewSettings.ts`
- Modify: `src/data/config/settings/sourcesSettings.ts`

**Why:** After breaking the `readConfig` cycle, a second cycle through `data/config/defaults.ts` surfaces. Five settings files import `assert` from `utils/assert`, and `defaults.ts` imports from all of them, creating the chain `defaults.ts` → `settings/matchingSettings.ts` → `assert.ts` → `serviceRegistry.ts` → `clientService/constants.ts` → `defaults.ts`. Replacing the `assert` imports with a lightweight substitute that does not import `ServiceRegistry` breaks the cycle. All `assert`/`softAssert` calls in these files are inside `readSettings` functions (called at runtime), so the behavior is equivalent — both paths throw `ConnectorError` on failure; the only difference is that the lite version does not call `ServiceRegistry.getCurrent().log.crash()` before throwing.

- [ ] **Step 1: Create `src/data/config/settings/assertLite.ts`**

```typescript
import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        logger.error(message)
        throw new ConnectorError(message, ConnectorErrorType.Generic)
    }
}

export function softAssert(condition: unknown, message: string, level: 'warn' | 'error' = 'warn'): boolean {
    if (!condition) {
        if (level === 'error') {
            logger.error(message)
        } else {
            logger.warn(message)
        }
        return false
    }
    return true
}
```

- [ ] **Step 2: Replace the import in all five settings files**

For each of the five files, replace:
```typescript
import { assert, softAssert } from '../../../utils/assert'
```
or
```typescript
import { assert } from '../../../utils/assert'
```

with the corresponding import from `'./assertLite'` (preserving which functions are imported).

Files and their current import line:
| File | Current import |
|---|---|
| `connectionSettings.ts` | `import { assert } from '../../../utils/assert'` |
| `developerSettings.ts` | `import { assert } from '../../../utils/assert'` |
| `matchingSettings.ts` | `import { assert, softAssert } from '../../../utils/assert'` |
| `reviewSettings.ts` | `import { assert } from '../../../utils/assert'` |
| `sourcesSettings.ts` | `import { assert, softAssert } from '../../../utils/assert'` |

- [ ] **Step 3: Verify the fix**

```bash
npm test 2>&1 | grep "FAIL "
```

Expected: `connectorDefaults.test.ts`, `matchingSettings.test.ts`, `advancedConnectionSettings.test.ts`, `reviewSettings.test.ts`, and `sourcesSettings.test.ts` no longer appear in the FAIL list.

### 8.3 — Fix `vi.mock` interop in test files

**Files:**
- Modify: `src/services/logService/__tests__/logService.test.ts`
- Modify: `src/services/clientService/__tests__/helpers.test.ts`
- Modify: `src/services/attributeService/__tests__/attributeService.test.ts`

**Why:** Three test files have Vitest-specific issues that Jest tolerated:
1. `logService.test.ts` — `vi.mock` factory references top-level `const mockLogger`, which is a TDZ violation after hoisting.
2. `helpers.test.ts` — `vi.mock('axios-retry')` factory has `default: {}`, but the consumer does `import axiosRetry from 'axios-retry'` which in Vitest correctly resolves to `default` (empty). The test then reads `axiosRetry.isNetworkError` → `undefined`.
3. `attributeService.test.ts` — an empty `describe('AttributeService incremental counter seeding')` block has no `it()` calls. Jest skips it silently; Vitest treats it as an error.

- [ ] **Step 1: `logService.test.ts` — wrap mockLogger in `vi.hoisted`**

```typescript
// BEFORE (logService.test.ts:1-22)
const mockLogger = {
    level: 'info',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}

vi.mock('@sailpoint/connector-sdk', () => {
    // ...
    return {
        logger: mockLogger,
        // ...
    }
})

// AFTER
const mockLogger = vi.hoisted(() => ({
    level: 'info' as const,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}))

vi.mock('@sailpoint/connector-sdk', () => {
    // ...
    return {
        logger: mockLogger,
        // ...
    }
})
```

`vi.hoisted` returns the factory's return value but runs the factory at hoist time (before the mock registration), so `mockLogger` is defined when the `vi.mock` factory closes over it.

- [ ] **Step 2: `helpers.test.ts` — populate the `default` export in the mock factory**

```typescript
// BEFORE (helpers.test.ts:11-15)
vi.mock('axios-retry', () => ({
    isNetworkError: vi.fn((err: any) => err?.isNetworkError === true),
    isRetryableError: vi.fn((err: any) => err?.isRetryable === true),
    default: {},
}))

// AFTER
vi.mock('axios-retry', () => {
    const isNetworkError = vi.fn((err: any) => err?.isNetworkError === true)
    const isRetryableError = vi.fn((err: any) => err?.isRetryable === true)
    return {
        isNetworkError,
        isRetryableError,
        default: { isNetworkError, isRetryableError },
    }
})
```

The functions are shared across the top-level keys and the `default` sub-object, so both `import { isNetworkError } from 'axios-retry'` and `import axiosRetry from 'axios-retry'; axiosRetry.isNetworkError` resolve to the same mock.

- [ ] **Step 3: `attributeService.test.ts` — remove the empty `describe` block**

Find the block (around line 301):

```typescript
describe('AttributeService incremental counter seeding', () => {
    const createService = () => { /* ... 40 lines of helpers ... */ }
    const createFusionAccount = (attrs: Record<string, any>) => { /* ... 30 lines ... */ }
    // no it() or test() calls
})
```

Delete the entire block (lines 301–378, from `describe('AttributeService incremental counter seeding', () => {` through the closing `})` before the next `describe('AttributeService mapping undefined behavior', () => {`). The helper functions inside were never used by any test.

- [ ] **Step 4: Verify the three fixes**

```bash
npm test 2>&1 | grep "FAIL "
```

Expected: `logService.test.ts`, `helpers.test.ts`, and `attributeService.test.ts` no longer appear in the FAIL list. Only pre-existing failures (`dateUtils.test.ts`, `formatting.test.ts`) should remain — those are not regressions from this migration.

### 8.4 — Run `npm test` to confirm all 8.x fixes pass

```bash
npm test 2>&1 | grep -E 'Test Files|Tests' | tail -3
```

Expected: 74 passed, 3 pre-existing failures (2 in `dateUtils`, 1 in `formatting`). 922+ tests pass. Zero `jest.*` references in `src/**/*.test.ts`.

If any test file other than `dateUtils.test.ts` or `formatting.test.ts` appears in the FAIL list, diagnose before continuing: the fix for that file is covered by one of the sub-tasks above and must be re-verified.

- [ ] **Step 5: Commit the interop fixes**

```bash
git add src/data/config/readConfig.ts \
        src/utils/assert.ts \
        src/data/config/settings/assertLite.ts \
        src/data/config/settings/connectionSettings.ts \
        src/data/config/settings/developerSettings.ts \
        src/data/config/settings/matchingSettings.ts \
        src/data/config/settings/reviewSettings.ts \
        src/data/config/settings/sourcesSettings.ts \
        src/data/config/index.ts \
        src/data/config/internal/index.ts \
        src/services/logService/__tests__/logService.test.ts \
        src/services/clientService/__tests__/helpers.test.ts \
        src/services/clientService/constants.ts \
        src/services/attributeService/__tests__/attributeService.test.ts
git commit -m "fix(tests): resolve vitest esm-interop regressions from jest migration

Break circular dependencies (readConfig, defaults->settings->assert),
fix vi.mock hoisting (logService), populate default export on
axios-retry mock (helpers), and remove empty describe block
 (attributeService)."
```

## Self-Review (run before declaring done)

- [ ] **Spec coverage:** The single ADDED requirement (`automated tests MUST run under Vitest`) is satisfied by Tasks 1, 2, 4, and 8.
- [ ] **Placeholder scan:** No "TBD", "TODO", "implement later", or "fill in details" in the plan body. Every step has either an exact command or an exact edit.
- [ ] **Type consistency:** The plan uses `vi` and `Mock` (from `vitest` / `vitest/globals`) consistently — no `jest.*` references in any step. Task 4 Step 1 explicitly re-checks this against the live tree.
- [ ] **File paths:** All paths are repo-relative from the worktree root.
