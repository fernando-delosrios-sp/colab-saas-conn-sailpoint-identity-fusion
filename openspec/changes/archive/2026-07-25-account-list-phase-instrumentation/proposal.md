## Why

A 14m 58s accountList profile showed ~133s unaccounted in the Process phase and a possible ~22s gap in Output — logged STEP durations summed to ~23s while the phase timer reported 2m 36s. Two expensive calls in `accountListPhases.ts` (`initializeManagedAccountProcessing`, `clearManagedAccounts`) run without STEP boundaries, so operators cannot attribute wall time to trigram/index build or managed-account cache teardown. A debugger-attached run further inflates step timers without corresponding work. Closing this observability gap is prerequisite to deciding whether Process/Output phases need optimization or only cleaner measurement.

## What Changes

**Process phase — managed account initialization**
- From: `fusion.initializeManagedAccountProcessing()` runs silently between `process-decisions` and `orphan-identity-hydration`
- To: Wrapped with `STEP managed-account-init START/END` (and optional METRIC) so index-build time appears in logs and heartbeat STATUS
- Reason: Likely accounts for most of the ~133s Process phase gap
- Impact: Non-breaking; logging only

**Output phase — managed account cache clear**
- From: `sources.clearManagedAccounts()` runs silently at Output phase start (non-record mode)
- To: Wrapped with `STEP clear-managed-accounts START/END` before subsequent output steps
- Reason: Possible ~22s gap between Output phase timer and `send-accounts` step
- Impact: Non-breaking; logging only; skipped in record mode (unchanged behavior)

**Verification guidance**
- Re-profile with `npm run dev` (no debugger) on the same dataset to separate real work from debugger overhead

## Capabilities

### New Capabilities

_(none — extends existing account-list pipeline logging requirement)_

### Modified Capabilities

- `account-list-operation`: Extend pipeline step-boundary requirement to include `managed-account-init` (Process) and `clear-managed-accounts` (Output)

## Impact

- **Code:** `src/operations/helpers/accountListPhases.ts` only (two STEP wrapper pairs)
- **Tests:** May extend account-list phase logging tests if present
- **APIs / config:** None
- **Runtime behavior:** No functional change to aggregation, matching, or memory management
