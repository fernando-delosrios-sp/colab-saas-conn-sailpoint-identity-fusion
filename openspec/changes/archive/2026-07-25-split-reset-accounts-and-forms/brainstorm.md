# Brainstorm: Split reset accounts and reset forms

## Background

Developer Settings currently exposes a single **Reset accounts?** toggle (`config.reset`). When enabled, Phase 1 Setup:

1. Deletes all Fusion review form definitions
2. Clears persisted `fusionState` and batch counters
3. Auto-disables the reset flag
4. Exits aggregation early (emits zero accounts)

Operators cannot reset accounts without deleting in-flight review forms, nor delete stale forms without triggering a full account reset.

## Decision chain

### Q1: Should reset forms be coupled to reset accounts?

**Initial idea:** Reset forms? visible only when Reset accounts? is enabled (child toggle).

**Decision:** **No — fully independent.** Either flag can be enabled alone or together. Both live side-by-side in Developer Settings with no `parentKey` dependency.

### Q2: What happens when only Reset forms? is enabled?

**Decision:** Delete all Fusion review form definitions during Setup, auto-disable `resetForms`, then **continue** with a normal aggregation (no early exit).

### Q3: What happens when only Reset accounts? is enabled?

**Decision:** Clear `fusionState`, reset batch counters, auto-disable `resetAccounts`, exit early with zero accounts. **Do not** delete forms.

### Q4: What happens when both are enabled?

**Decision:** Delete forms first, then perform account reset and early exit. Both flags auto-disable independently.

### Q5: Should flags auto-disable after run?

**Decision:** **Yes.** Same transient pattern as `forceAttributeRefresh`. Each flag patches itself back to `false` after being consumed on a persistent run.

### Q6: Config naming and defaults?

**Decision:**

- Rename `reset` → `resetAccounts` for alignment with `resetForms`
- Both default to **`false`**
- Read legacy `reset` key as fallback for `resetAccounts` during upgrade; disable path clears both `resetAccounts` and legacy `reset`

### Q7: Dry-run behavior?

**Decision:** Unchanged — reset side effects only run when `isPersistent` is true. Dry-run may detect flags but does not delete forms or patch config.

## Design trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Independent toggles (chosen) | Maximum operator control; forms-only cleanup without account wipe | Accounts-only reset leaves stale forms; forms-only reset may immediately re-queue managed accounts for Match |
| Coupled child toggle | Simpler mental model | Cannot delete forms without account reset |
| Single toggle with enum | One setting | Poor UX; harder to discover |

## Risks to document

- **Accounts-only reset:** Pending forms may reference managed-account keys from prior fusion state; duplicate or stale forms possible on next full run
- **Forms-only reset:** Managed accounts held out of Match by pending forms re-enter the work queue on the same aggregation; new review forms may be created immediately
- **Breaking rename:** Existing configs with `reset: true` need legacy read fallback until saved with new key

## Acceptance criteria (converged)

1. `resetAccounts` and `resetForms` are independent Developer Settings toggles, both default `false`
2. Each auto-disables after one persistent aggregation
3. Account reset clears state and emits zero accounts; form reset deletes Fusion review form definitions
4. Legacy `reset` config key continues to work as `resetAccounts` until migrated
5. Tests cover config parsing, setup-phase branching, and FusionService disable methods
