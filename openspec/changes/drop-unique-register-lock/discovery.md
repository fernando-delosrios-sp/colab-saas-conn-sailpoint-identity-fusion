# Discovery — drop-unique-register-lock

## Scope

**In:** `DefinitionService.registerUniqueAttributes` must not `await locks.withLock('unique:${name}')` around `Set.add` of an already-computed value. Refresh (`processFusionAccount`) and record unique registration both call this method. Spec delta for `definition-service` (reopen the “lock-serialize every unique-set write” rule). Tests + changelog.

**Out:** `tryRegisterUniqueValue` check-then-add lock (new Unique generation). Counter lock. `unregisterUniqueAttributes` lock. Velocity-outside-lock work already landed. `honor-managed-account-refresh-threshold` (independent). Identity `modified` investigate.

## Language terms

| Term | Status |
|------|--------|
| **Record unique registration** | promote |
| Unique registry lock | draft — `locks.withLock` key `unique:${definition.name}`; not a glossary Term entry |
| **Define** | promote |

## Decisions

- **Perf:** Refresh calls `registerUniqueAttributes` for every Fusion account (`fusionService.ts` uniqueRegister sub-step). Each unique definition `await`s the per-name lock then `Set.add`. That serializes the parallel Fusion-account walk on `unique:<name>` even though the value already exists and add is a single synchronous mutation.
- **Safety:** Node is single-threaded. `Set.add` / `Set.has` with no `await` between them cannot interleave. `tryRegisterUniqueValue` already keeps has-then-add in one lock callback with no inner `await`. Preserve-existing in `processUniqueDefinition` already `Set.add`s without the unique lock (`definitionService.ts:809-811`). Removing the lock from register matches that pattern and **removes** a yield that currently lets tasks interleave.
- **Spec conflict:** `definition-service` requirement **Record unique registration processes accounts in bounded parallel batches** currently says unique-set mutations SHALL remain serialized via the unique-attribute lock, and a scenario requires both parallel registrations to enter that lock. Reopen: existing-value insert does not take the lock; collision-safe *generation* still does.
- **Keep** `unregisterUniqueAttributes` locked (not on the Refresh hot path; delete+debug log).

## Open questions

_(none)_

## Scenarios discussed for specs

- `registerUniqueAttributes` does not call `withLock` for `unique:${name}`
- Parallel record unique registration still yields the same set as a serial walk
- Duplicate values register once
- New Unique generation still uses `tryRegisterUniqueValue` lock (no duplicate values in concurrent Output)
