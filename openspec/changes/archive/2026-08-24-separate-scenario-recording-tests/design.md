## Context

Default Vitest (`npm test`) uses one config (`vitest.config.ts`) with include `src/**/__tests__/**/*.test.ts`, `src/**/*.test.ts`, and `scripts/__tests__/**/*.test.cjs`. That pulls in every `*.test.ts` under `src/operations/__tests__/scenario/` (framework/harness/data are already excluded as non-tests). Developers need that folder as an opt-in suite, distinct from `npm run test-recording` (CLI that verifies one on-disk recording).

## Goals / Non-Goals

**Goals:**

- `npm test`, `test:watch`, and `test:coverage` never load `src/operations/__tests__/scenario/**/*.test.ts`.
- `npm run test:scenario` runs those files with the same runner settings (node, 180s timeout, globals, threads).
- Docs and AGENTS.md invoke the scenario suite via `test:scenario`, not `npm test -- <path>`.

**Non-Goals:**

- Changing `npm run test-recording` or recording/replay production code.
- Adding a GitHub Actions unit-test job.
- Splitting fixture tests vs env-gated tests inside the scenario folder.
- Promoting suite names into ubiquitous language.

## Decisions

### D1: Exclude glob plus second Vitest config

- **Choice**: Add `src/operations/__tests__/scenario/**` to `vitest.config.ts` `exclude`. Add `vitest.scenario.config.ts` whose `include` is `src/operations/__tests__/scenario/**/*.test.ts` (framework/harness/data stay out because they are not `*.test.ts`). Script: `"test:scenario": "vitest run --config vitest.scenario.config.ts"`.
- **Reason**: Vitest `exclude` wins over CLI file paths, which is the desired “cannot sneak scenario tests into `npm test`” behavior. A second config is the supported way to run excluded files.
- **Considered alternatives**: Vitest `projects` in one config — `npm test` would still need `--project` filtering and is easier to misconfigure so both projects run. CLI `--dir` without exclude — `npm test` would still pick up the folder.

### D2: Share runner settings by duplication, not a shared module

- **Choice**: Copy `environment`, `testTimeout`, `pool`, `globals` into `vitest.scenario.config.ts`. Coverage stays on the global config only (`test:coverage` remains global-suite coverage).
- **Reason**: Two small configs beat a shared helper for this split; coverage of scenario tests is not a goal.
- **Considered alternatives**: Extract `vitest.shared.ts` — extra file for two near-identical option blocks.

### D3: knip lists both configs

- **Choice**: Add `vitest.scenario.config.ts` to `package.json` knip `vitest.config`.
- **Reason**: knip already treats Vitest config as an entry; the second file must be visible or it looks unused.

## Risks / Trade-offs

- [Risk] Developers keep running `npm test -- src/operations/__tests__/scenario/...` and see 0 tests → Mitigation: docs, AGENTS.md, and a CHANGELOG note with the new script.
- [Risk] `test:scenario` and global config drift (timeout, globals) → Mitigation: keep both configs tiny; tasks include a same-settings check.
- [Trade-off] Fixture harness tests leave the default suite → Reason: user chose the entire scenario directory as the opt-in set.
- [Trade-off] No CI job for either suite → Reason: repo has no default unit-test workflow today; out of scope.

## Migration Plan

N/A — This change does not involve deployment changes. Local/docs migration: use `npm run test:scenario` instead of `npm test -- src/operations/__tests__/scenario/...`.

## Open Questions

None. Deferred: a future CI job that runs `npm test` then `npm run test:scenario`.
