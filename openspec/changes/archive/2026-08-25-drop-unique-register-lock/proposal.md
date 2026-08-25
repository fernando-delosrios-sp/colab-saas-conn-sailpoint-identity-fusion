## Why

Account-list Refresh registers existing Unique values on every Fusion account before Map/Define. That path only inserts strings already on the attribute bag; it does not generate values. Today each insert `await`s `locks.withLock('unique:${name}')`, so parallel `processFusionAccounts` and parallel record unique registration queue on one lock per unique attribute. The lock was left over from when Unique Velocity ran under it. Generation already shrunk the lock to check-then-add (`tryRegisterUniqueValue`). Paying the same lock for `Set.add` of known values is wasted yield + queueing on the Refresh `uniqueRegister` sub-step.

## What Changes

**Existing-value unique register**
- From: `registerUniqueAttributes` awaits `withLock('unique:${name}')` then `Set.add`
- To: `assert` + `getUniqueValues(name).add(valueStr)` with no unique-registry lock and no `await` in the definition loop
- Reason: Single-threaded `Set.add` is atomic; preserve-existing Unique refresh already adds without this lock
- Impact: Refresh uniqueRegister and record unique registration stop serializing on `unique:<name>`

**Spec**
- From: All unique-set mutations for record unique registration SHALL be lock-serialized; scenario requires entering the per-name lock
- To: Insert of an already-known value SHALL NOT take `unique:${name}`; check-then-add for *new* generated values still SHALL; parallel registration still produces the same set members as a serial walk
- Reason: Reopen archived `speed-up-account-list-process-phase` lock rule for register-only writes

**Unchanged**
- `tryRegisterUniqueValue` lock around has-then-add
- Velocity evaluation outside that lock
- Counter lock
- `unregisterUniqueAttributes` still uses the unique lock
- `registerExistingValues` (already unlocked bulk add)
- Fusion parallel batch size for record unique registration

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `definition-service`: Existing unique-value registration does not take the unique registry lock; generation check-then-add still does

## Impact

- **Code:** `src/services/definitionService/definitionService.ts`; tests in `recordUniqueRegistration.test.ts` and/or `defineService.test.ts`
- **Docs:** Changelog only (operator-visible: faster Refresh/Process unique registration; uniqueness of newly generated values unchanged)
- **Migration:** None

## Apply status

- **Status**: Applied
- **Depends on**: none
- **Issue**:
