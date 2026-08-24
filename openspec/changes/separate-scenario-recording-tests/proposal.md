## Why

`npm test` currently discovers every Vitest file under `src/operations/__tests__/scenario/` together with the rest of the connector suite. Those tests include process-spawn CLI checks, orchestrator integration, and optional local-recording replays. Mixing them into the global suite makes everyday runs slower and easier to confuse with `npm run test-recording` (named golden replay). Splitting discovery so the scenario folder is opt-in keeps the default command focused and makes recording-related Vitest explicit.

## What Changes

**Vitest discovery for scenario tests**
- From: `npm test`, `test:watch`, and `test:coverage` include `src/operations/__tests__/scenario/**/*.test.ts` (framework/harness/data dirs already excluded as non-tests).
- To: Those files are excluded from the global suite; `npm run test:scenario` runs them.
- Reason: Scenario recording Vitest must be invoked separately from the global suite.
- Impact: Non-breaking for production; developers and docs that passed `npm test -- src/operations/__tests__/scenario/...` must use `test:scenario` instead.

**Named recording CLI**
- Unchanged: `npm run test-recording -- tenant/scenario` still verifies one on-disk scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `testing`: Default Vitest commands SHALL exclude `src/operations/__tests__/scenario/**/*.test.ts`; a `test:scenario` script SHALL run that suite. Discovery, docs, and AGENTS.md SHALL distinguish the global suite from `test-recording`.

## Impact

- `vitest.config.ts` — exclude glob for the scenario test directory
- `package.json` — add `test:scenario`
- `openspec/specs/testing/spec.md` — discovery and invocation requirements
- `AGENTS.md` — test command table
- `docs/use-guides/validation-and-troubleshooting/testing-and-validation.md`, `docs/reference/scenario-recording.md` — replace `npm test -- …/scenario/…` with `npm run test:scenario`
- No production runtime, connector-spec, or dependency changes
