# Retrospective

**Change**: `velocity-helper-empty-fallback`
**Completed**: 2026-08-13

## What went well

- The root cause was well understood from the Datefns bug report: `velocityjs` renders literal expressions when helpers return `undefined`.
- Consolidating three near-identical wrappers (`withNormalizeFallback`, `withDatefnsFallback`, new shared utility) reduced duplication without changing successful-path behavior.
- Existing `formatting.test.ts` integration tests provided strong regression coverage; only a few failure-path tests were needed for JSON and AddressParse.

## What could improve

- The Datefns fix landed as a direct commit before the OpenSpec change was proposed — the apply phase refactored it into the shared utility rather than re-implementing from scratch.
- `#set($p=$JSON.parse($raw))$JSON.stringify($p)` behavior changed subtly when parse returns `''` instead of `undefined` (re-serialize yields `""`). Documented via updated test expectation.

## Follow-ups

- None required. Optional: dedicated unit tests for `velocityFallback.ts` if wrapper logic grows more complex.
