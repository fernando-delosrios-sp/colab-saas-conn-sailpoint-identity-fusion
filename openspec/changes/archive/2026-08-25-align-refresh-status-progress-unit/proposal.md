## Why

Refresh STATUS repeats the same count twice: `progress=19032/102407 processed(Δ+192/10s) refreshed(19032)`. Fetch already uses a single verb on the progress unit (`fetched(Δ+…/10s)`). `processed` is the generic `batchProcess` label, and `refreshed(N)` was a needsRefresh subset that matches visited counts under the default 60s threshold. Operators need one Refresh throughput token, consistent with Fetch.

## What Changes

**Refresh STATUS progress unit**
- From: `progress=19032/102407 processed(Δ+192/10s) refreshed(19032)`
- To: `progress=19032/102407 refreshed(Δ+192/10s)`
- Reason: Match Fetch’s `progress=done/total {unit}(Δ…)` shape; drop a redundant cumulative.
- Impact: Log-string change for scrapers matching `processed(Δ` during Refresh or `refreshed(N)`.

**needsRefresh STATUS counter removed**
- From: `recordRefreshedAccount()` / `refreshedCount` always printed on Refresh STATUS.
- To: No extra `refreshed(N)` segment; no `recordRefreshedAccount` API.
- Reason: Nothing else consumes the counter; subset vs visited is not worth a STATUS slot.
- Impact: Internal API removal; tests that assert `refreshed(500)` next to a different `progress.done` must change.

**Process `processed` unit unchanged**
- From/To: Identity, decision, and correlated-sweep `batchProcess` still use unit `processed`.
- Reason: Out of scope; rename later if those steps get dedicated verbs.

**Refresh correlation segment**
- From: Documented as sitting alongside `refreshed(N)`.
- To: Same correlation segment next to `progress=… refreshed`.
- Impact: Spec wording only; runtime correlation behavior unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `log-service`: Refresh STATUS SHALL render unit `refreshed` with interval delta; SHALL NOT emit `refreshed(N)`; correlation scenario SHALL not require `refreshed(N)`; remove refreshed-count helpers from the run context contract.
- `account-list-operation`: Refresh SHALL drive `setProgress` with unit `refreshed` while walking Fusion accounts (analogous to Fetch `fetched`).
- `ubiquitous-language`: Promote **Refreshed (progress unit)**.

## Impact

- `src/services/fusionService/collections.ts` — optional progress unit on `batchProcess` (default `processed`)
- `src/services/fusionService/fusionService.ts` — pass `refreshed`; drop `recordRefreshedAccount`
- `src/services/logService/` — STATUS formatter; delete `recordRefreshedAccount` / `refreshedCount`
- Tests: `operationHeartbeat.test.ts`, `operationRunContext.test.ts`, collections tests if unit is parameterized
- Docs: `docs/reference/observability.md` STATUS units; operator greps
- CHANGELOG via changelog-generator during apply
- No connector-spec settings; no runtime behavior change besides log text
