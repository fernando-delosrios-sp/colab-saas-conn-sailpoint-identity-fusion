## Why
The codebase has accumulated dead code, unused exports, and relaxed linting rules over time. This creates a maintenance burden, adds cognitive load for developers who waste time understanding unused code, and introduces the risk of referencing dead constants or relying on unsafe typings. A holistic cleanup is needed now to restore confidence and tooling strictness.

## What Changes
- Enforce strict linting rules in `eslint.config.mjs` (`@typescript-eslint/no-unused-vars`: `error`, `no-explicit-any`: `error`, `no-case-declarations`: `error`).
- Remove `log-server.js` and `scripts/` from ESLint ignores.
- Remove known dead code across the codebase (`STATS_LOGGING_INTERVAL_MS` and other unused exports in `constants.ts`, `getShortTimestamp` in `log-server.js`, `isRecordMatchingEnabledForSource` in `fusionService.ts`, `_TOKEN_PATTERNS` in `dateUtils.ts`).
- Remove any newly discovered dead code flagged by the strict linting rules.
- Replace any unsafe `any` types uncovered by the strict linting rules with proper types, interfaces, or generics.
- Fix all `no-case-declarations` errors by adding proper `{ }` block scoping to switch statement cases.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact
- Build and CI pipelines will fail if dead code or `any` types are introduced in the future.
- Various files across the codebase will be modified to remove dead code and add proper types and block scopes.
