# Brainstorm: Consistent Log Format

## Background

Account-list runs emit a mix of structured lines (`PHASE`, `STEP`, `STATUS`, `METRIC`, `EVENT_SUMMARY`) and legacy free-form INFO messages. Sample production logs show:

- Bootstrap messages without any prefix (`Minimum score for manual review`, `Configuration validation completed successfully`, `Initializing StateWrapper`)
- Dual phase boundaries (`PHASE 1 Setup START` plus `PHASE 1: Setup and initialization (26.4S)`)
- Duplicate email logs per send (`Sent email` + `Sent fusion review email`)
- Other operations (`accountCreate`, `testConnection`, etc.) still use `timer.phase('Step N: …')` instead of `STEP` lines

LogService and OpenSpec already define structured line kinds in `openspec/specs/log-service/spec.md`, but implementation and several specs are out of sync.

## Decision Chain

### Q1: Scope — which logs to standardize?

**Options considered:**
1. accountList only — smallest diff, leaves other operations inconsistent
2. All connector operations — consistent grep targets across accountList, accountCreate, testConnection, etc.
3. Full codebase including config bootstrap — adds `[config]` prefix for pre-operation messages

**Decision:** All connector operations + bootstrap config messages (option 3). Operators grep one format family across the entire run from config load through operation completion.

### Q2: Dual phase logging — keep START + colon-style timing lines, or merge?

**Options considered:**
1. Structured only — `PHASE END elapsed=…`; remove `PhaseTimer.phase('PHASE N: …')`
2. Keep both — structured for monitoring, colon lines for humans
3. Merge — one START + one END per boundary (`PHASE 1 Setup END elapsed=26.4S`)

**Decision:** Merge (option 3). Eliminates duplicate lines; timing still available on END and in METRIC/phase breakdown for HTML reports via `PhaseTimer.recordElapsed()`.

### Q3: Free-form operational INFO — demote to debug or add a new kind?

**Options considered:**
1. Demote everything to debug — loses visibility at Info level
2. New `DETAIL` kind with key=value payload — grep-friendly, preserves Info visibility for milestones
3. Leave as unstructured INFO — no improvement

**Decision:** Introduce `DETAIL` line kind (option 2). High-volume per-account events continue using debug + `EVENT_SUMMARY`.

### Q4: Email log deduplication?

**Decision:** Single `DETAIL email sent …` line per send; batch sends during uncorrelated-sweep also increment `recordEvent('emailSent')` for `EVENT_SUMMARY email=+N/10s`.

### Q5: Epilogue label format?

Existing spec (`ubiquitous-language`) requires `Epilogue: report generation`. New structured pattern uses `EPILOGUE report START` / `EPILOGUE report END elapsed=…`. Domain term **Epilogue** preserved; log kind is `EPILOGUE`.

### Q6: api-queue STATUS segment — spec says `api-queue completed=` but code uses `api=Na/Nq/Nc`?

**Decision:** Align spec/docs to compact format already in code and tests. No runtime change.

## Agreed Approach

Target format: `[{context}] {KIND} {payload}`

- Context: `[accountList]`, `[accountCreate]`, … during operations; `[config]` during bootstrap
- Kinds: PHASE, STEP, STATUS, METRIC, EVENT_SUMMARY, EPILOGUE, DETAIL, WARN STALL (unchanged kinds keep current behavior)

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Breaking change for log monitors grepping `PHASE N:` or `Epilogue:` | Document migration in advanced-connection-settings |
| Spec updates required (log-service, account-list-operation, ubiquitous-language) | Required for contract change; included in change scope |
| ESLint rule blocking direct SDK logger imports | Catches regressions; allowlist logService + bootstrapLog + test mocks |
| Phase timing for HTML reports without colon-style host lines | Use PhaseTimer internal tracking, not host-visible duplicate lines |

## Success Criteria

- Every INFO line during an operation matches a known KIND prefix (or final `✓ … completed` summary)
- No duplicate PHASE boundary lines per phase
- No duplicate email lines per send
- `npm test` passes with updated assertions
- OpenSpec deltas applied to three existing specs
