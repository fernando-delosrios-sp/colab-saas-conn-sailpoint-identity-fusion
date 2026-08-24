## 1. Vitest configs and npm scripts

- [x] 1.1 Add `src/operations/__tests__/scenario/**` to `exclude` in `vitest.config.ts`
- [x] 1.2 Create `vitest.scenario.config.ts` with `include: ['src/operations/__tests__/scenario/**/*.test.ts']` and the same `environment`, `testTimeout`, `pool`, and `globals` as the global config (no coverage block)
- [x] 1.3 Add `"test:scenario": "vitest run --config vitest.scenario.config.ts"` to `package.json` scripts
- [x] 1.4 Add `vitest.scenario.config.ts` to knip `vitest.config` in `package.json`

## 2. Verification

- [x] 2.1 Confirm canonical test commands: `npm test` (global suite) and `npm run test:scenario` (scenario recording suite)
- [x] 2.2 Run `npm test` and confirm the reporter lists no files under `src/operations/__tests__/scenario/`
- [x] 2.3 Run `npm test -- src/operations/__tests__/scenario/chain.replay.test.ts` and confirm Vitest does not execute that file
- [x] 2.4 Run `npm run test:scenario` and confirm fixture tests execute without recording env vars; env-gated tests skip when unset
- [x] 2.5 Confirm `npm run test-recording` still exists and is unchanged in `package.json`
- [x] 2.6 Run `npm run lint` (covers knip seeing the second Vitest config)

## 3. Documentation

- [x] 3.1 Update `AGENTS.md` test command table: `npm test` is the global suite; add `npm run test:scenario`
- [x] 3.2 Update `docs/use-guides/validation-and-troubleshooting/testing-and-validation.md` — replace `npm test -- …/scenario/…` with `npm run test:scenario`
- [x] 3.3 Update `docs/reference/scenario-recording.md` harness unit tests section to `npm run test:scenario`
- [x] 3.4 Confirm README / getting-started have no `npm test -- …/scenario` invocations (no edit if absent)
- [x] 3.5 Run `npm run lint:docs-guides` and `npm run lint:markdown` if docs under `docs/` changed

## 4. Changelog

- [x] 4.1 Create or update changelog entry for this change (apply invokes changelog-generator)
- [x] 4.2 Confirm entry tells developers to use `npm run test:scenario` instead of `npm test` for files under `src/operations/__tests__/scenario/`
