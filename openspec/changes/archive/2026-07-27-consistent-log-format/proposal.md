## Why

Connector logs mix structured heartbeat lines with legacy free-form messages, duplicate phase timing lines, and unprefixed bootstrap output. Operators cannot reliably grep a single format across a full aggregation run, and existing OpenSpec requirements conflict with the implemented `api=Na/Nq/Nc` STATUS segment and dual `PHASE` logging. Standardizing now reduces monitoring drift and completes the operation-heartbeat logging initiative started in July 2026.

## What Changes

**Phase boundaries**
- From: `PHASE N Name START` plus legacy `PHASE N: Description (elapsed)` via PhaseTimer
- To: `PHASE N Name START` and `PHASE N Name END elapsed=…` only
- Reason: One line per boundary; user chose merge over dual logging
- Impact: Non-breaking for STATUS/STEP monitors; breaking for greps targeting `PHASE [1-5]:`

**Operational INFO messages**
- From: Free-form strings (`Loaded 3 managed source(s)`, `Sent email …`)
- To: `DETAIL key=value …` with operation or `[config]` prefix
- Reason: Grep-friendly structured payload without heartbeat overhead
- Impact: Non-breaking at log level; message text changes for monitors

**Bootstrap logging**
- From: Direct SDK `logger` calls without prefix during config load
- To: `[config] DETAIL …` via bootstrapLog wrapper
- Impact: Non-breaking; adds prefix to previously bare lines

**Other operations**
- From: `timer.phase('Step N: …')` in accountCreate, accountEnable, accountDisable, testConnection, etc.
- To: `STEP {slug} START` / `STEP {slug} END elapsed=…`
- Impact: Message format change for non-accountList operations

**Email logging**
- From: Two INFO lines per fusion review email
- To: One `DETAIL email sent …` line; batch counts in `EVENT_SUMMARY email=+N/10s`
- Impact: Reduces log volume ~50% during uncorrelated sweep

**Epilogue labels**
- From: `Epilogue: report generation (elapsed)` (PhaseTimer)
- To: `EPILOGUE report END elapsed=…`
- Impact: Aligns with structured EPILOGUE kind; updates ubiquitous-language spec

## Capabilities

### New Capabilities

_(none — all changes extend existing log-service and operation specs)_

### Modified Capabilities

- `log-service`: Add DETAIL kind, phaseEnd/epilogueEnd helpers, `[config]` bootstrap prefix; update PHASE END requirement; align api-queue STATUS segment documentation to compact format
- `account-list-operation`: Replace colon-style phase timing requirement with PHASE END lines; add DETAIL/EVENT_SUMMARY email expectations
- `ubiquitous-language`: Update Epilogue log label requirement from `Epilogue: …` to structured `EPILOGUE … START/END`; add DETAIL line glossary entry

## Impact

- **Code:** `src/services/logService/`, all `src/operations/*.ts`, `emailService`, `workflowService`, config settings, `operationHandler`, `stateWrapper`
- **Tests:** `logService.test.ts`, `operationHeartbeat.test.ts`, `accountList.test.ts`, per-operation tests
- **Docs:** `docs/guides/advanced-connection-settings.md`, `docs/concepts/glossary.md`
- **Specs:** Three MODIFIED delta specs under this change
- **External:** Log monitors grepping legacy `PHASE N:` or `Epilogue:` patterns need updated targets (documented in operator guide)
