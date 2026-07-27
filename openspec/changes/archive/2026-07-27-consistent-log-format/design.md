## Context

The connector centralizes logging in `LogService` (`src/services/logService/`). Account-list already emits structured `PHASE`, `STEP`, `STATUS`, `METRIC`, and `EVENT_SUMMARY` lines when `operationContext` is set via `ServiceRegistry`. However:

- `PhaseTimer.phase()` still emits colon-style timing lines in parallel with `phaseStart()`
- ~40 free-form INFO calls bypass structured kinds
- Config bootstrap uses SDK `logger` directly (no prefix)
- Other operations use PhaseTimer step messages instead of `STEP` lines
- OpenSpec text for api-queue STATUS segment does not match implementation

Stakeholders: operators monitoring aggregations, developers debugging runs, external logging consumers.

## Goals / Non-Goals

**Goals:**
- Every host-visible INFO line during operations uses `[context] KIND payload` format
- One START + one END per phase boundary (no duplicate timing lines)
- `DETAIL` kind for operational milestones (sources loaded, emails sent, workflow resolved)
- All connector operations use `STEP` boundaries instead of PhaseTimer prose
- `[config]` prefix for pre-operation bootstrap messages
- Spec/docs aligned with implementation

**Non-Goals:**
- JSON structured logs to ISC host (plain text contract unchanged)
- External logging HTTP payload shape changes
- Rewriting debug-level Velocity/normalize/form builder logs
- New capabilities or spec files beyond deltas to existing three specs

## Decisions

### D1: Merge phase boundaries into START/END pair

- **Choice:** `log.phaseStart(n, phase)` at entry; `log.phaseEnd(n, phase, detail?)` at exit with `elapsed=`
- **Reason:** User selected merge over dual logging; matches existing STEP pattern
- **Considered alternatives:** Keep PhaseTimer colon lines (rejected — duplicate noise); structured-only without END (rejected — loses timing on host)

### D2: Introduce DETAIL line kind

- **Choice:** `log.detail(data: Record<string, unknown>)` emits `DETAIL key=value …`
- **Reason:** Preserves Info visibility without inventing per-domain kinds (EMAIL, SOURCE, etc.)
- **Considered alternatives:** Demote to debug (rejected — loses operator visibility); unstructured INFO (rejected — no grep consistency)

### D3: Bootstrap logger with [config] prefix

- **Choice:** New `bootstrapLog.ts` wrapping SDK logger; used in config settings and assertLite
- **Reason:** Distinguishes pre-operation messages without faking an operationContext
- **Considered alternatives:** No prefix (rejected); reuse `[bootstrap]` (rejected — `[config]` matches domain)

### D4: Route in-operation service logs through LogService

- **Choice:** `ServiceRegistry.getCurrent()?.log ?? bootstrapLog` in StateWrapper and similar
- **Reason:** Same pattern as `utils/assert.ts`; preserves operation prefix when registry exists
- **Considered alternatives:** Pass LogService through every constructor (rejected — large refactor)

### D5: Email dedup + EVENT_SUMMARY aggregation

- **Choice:** Single `DETAIL email sent …` in `sendEmail()`; optional `formId`; `recordEvent('emailSent')` for heartbeat
- **Reason:** Halves email log volume; batch visibility via existing EVENT_SUMMARY machinery
- **Considered alternatives:** Debug-only email logs (rejected — operators need send confirmation)

### D6: Align api-queue spec to compact STATUS segment

- **Choice:** Update spec/docs to `api=Na/Nq/Nc(Δ±N/interval)` — no code change
- **Reason:** Implementation and tests already use compact format; changing code would break existing monitors
- **Considered alternatives:** Change code to `api-queue completed=` (rejected — unnecessary breaking change)

### D7: Phase timing for HTML reports without host colon lines

- **Choice:** `PhaseTimer.recordElapsed(phase, ms)` internally; METRIC lines for sub-phase timing unchanged
- **Reason:** Report epilogue needs timing breakdown without emitting `PHASE N:` to host
- **Considered alternatives:** Keep colon lines for reports only (rejected — violates merge decision)

### D8: ESLint guardrail for direct logger imports

- **Choice:** Restrict `import { logger } from '@sailpoint/connector-sdk'` to `logService/` and `bootstrapLog.ts`
- **Reason:** Prevents regression to unstructured logging
- **Considered alternatives:** Documentation-only (rejected — easy to miss in review)

## Risks / Trade-offs

- [Risk] Log monitors grepping `PHASE [1-5]:` break → Mitigation: Document replacement patterns in advanced-connection-settings migration table
- [Risk] DETAIL key=value less human-readable than prose → Mitigation: Keep descriptive keys (`source`, `subject`, `recipients`); high-volume events stay in EVENT_SUMMARY
- [Risk] Large diff across operations → Mitigation: Mechanical STEP migration per operation file; test each operation independently
- [Trade-off] Spec MODIFIED requirements need full text paste → Accepted: Required by OpenSpec archive apply semantics

## Migration Plan

1. Ship LogService API additions (phaseEnd, detail, epilogueEnd, bootstrapLog) with tests
2. Migrate accountList (highest visibility) — remove PhaseTimer.phase colon lines
3. Migrate other operations to STEP
4. Convert free-form INFO to DETAIL in services
5. Update tests and docs
6. Apply OpenSpec archive when implementation verified

**Rollback:** Revert commit; no schema/config migration required. External monitors may need grep pattern updates regardless.

**Acceptance:** `npm test` green; dry-run grep shows no `PHASE [1-5]:` or duplicate email lines; all lines match known KIND prefixes.

## Open Questions

- None blocking — scope (all operations), phase merge, and DETAIL kind confirmed in brainstorming.
