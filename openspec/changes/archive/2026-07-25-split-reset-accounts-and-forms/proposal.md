## Why

The Developer Settings **Reset accounts?** toggle currently couples account wipe and form deletion into one operation. Operators who need to rebuild Fusion accounts from scratch must also delete all in-flight review forms, and there is no supported way to clear stale forms without triggering a full account reset. Splitting these into independent, transient flags gives operators precise control while preserving the existing safety model (auto-disable after one run).

## What Changes

**Developer Settings toggles**
- From: Single `reset` boolean that deletes forms, clears fusion state, and exits with zero accounts
- To: Independent `resetAccounts` and `resetForms` booleans (both default `false`), each auto-disabled after one persistent aggregation
- Reason: Decouple account rebuild from form cleanup
- Impact: Non-breaking with legacy `reset` read fallback; connector-spec key renamed to `resetAccounts`

**Reset accounts behavior**
- From: Deletes forms as part of account reset
- To: Clears `fusionState`, resets batch counters, emits zero accounts, exits early — forms untouched unless `resetForms` is also enabled
- Reason: Preserve pending reviews during account rebuild when desired
- Impact: Operators must explicitly enable `resetForms` to replicate prior coupled behavior

**Reset forms behavior**
- From: Only runs as side effect of account reset
- To: Standalone flag that deletes all Fusion review form definitions during Setup, then continues normal aggregation
- Reason: Allow form cleanup without account wipe
- Impact: Managed accounts previously held by pending forms re-enter Match on the same run

## Capabilities

### New Capabilities

_(none — requirements extend existing operation and service specs)_

### Modified Capabilities

- `account-list-operation`: Add Setup-phase requirements for independent `resetAccounts` and `resetForms` handling, dry-run gating, and early-exit semantics
- `fusion-service`: Add requirements for `isResetAccounts`, `isResetForms`, and corresponding auto-disable config patch methods

## Impact

- `connector-spec.json` — rename `reset` → `resetAccounts`, add `resetForms` toggle
- `src/data/config/settings/developerSettings.ts` — parse both flags; legacy `reset` fallback
- `src/model/config.ts` — `DeveloperSettingsSection` type update
- `src/services/fusionService/fusionService.ts` — new flag accessors and disable methods
- `src/operations/helpers/accountListPhases.ts` — split Setup reset branches
- Tests, README, and advanced-settings docs
