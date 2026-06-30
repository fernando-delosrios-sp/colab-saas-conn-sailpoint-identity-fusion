## Context

`src/data/status.ts` is the only place where the connector declares the *set* of status entitlements (`authorized`, `auto`, `baseline`, `manual`, `orphan`, `nonMatched`, `reviewer`, `requested`, `uncorrelated`, `activeReviews`, `candidate`). The *string IDs* from that file are then hand-typed in roughly a dozen call sites that mutate or read the `FusionAccount._statuses` set. There is no shared vocabulary, so the compiler cannot help if a developer mistypes `'activeReviews'` as `'activeReview'` (single-s vs single — has happened before in similar codebases) or writes `'nonMatched'` as `'non_matched'`.

We want a single TypeScript `enum` (string-valued) that names every status entitlement. Adding a new status becomes "add one member, one entry in `data/status.ts`, and the compiler tells you every site that still needs updating." Existing public signatures on `FusionAccount` (`addStatus`, `removeStatus`, `hasStatus`) keep their `string` parameters so persisted payloads and external callers stay compatible — the enum is the canonical source of values, not a new public contract.

The existing `Status` class in `src/model/status.ts` represents an entitlement *object* (wrapping an `EntitlementSource` for serialization via the SDK). It is not the same concept as a status identifier, so it stays as is. To avoid the name collision with the requested `Status` enum, the new enum is named `StatusEntitlement` and lives in its own file `src/model/statusEntitlement.ts`. The class file `status.ts` continues to export the class `Status`.

## Goals / Non-Goals

**Goals:**
- Provide one TypeScript `enum StatusEntitlement` whose string values are exactly the `id` of every entry in `src/data/status.ts`.
- Make `src/data/status.ts` derive each `id` from the enum, so the data file cannot drift from the enum.
- Replace status ID string literals at every call site that the connector owns (production + test) with the corresponding enum member.
- Keep the public `FusionAccount.addStatus` / `removeStatus` / `hasStatus` signatures unchanged (`string`) so serialized `statuses` payloads and external callers continue to work.
- Add a unit test that locks the enum↔data contract.

**Non-Goals:**
- Renaming the existing `Status` class in `src/model/status.ts`.
- Changing the serialized shape of the `statuses` attribute on the fusion account.
- Tightening `addStatus` / `removeStatus` / `hasStatus` to accept only the enum (that is a future, breaking change for any external caller).
- Adding new statuses (none added in this change; we only type the existing set).
- Touching action entitlements (`src/model/action.ts`) — separate change.

## Decisions

### Decision 1: Plain `enum` (string-valued), not `const enum` or string-literal union

A regular `enum` is requested ("create an enum") and gives us:
- Named members usable at the call site (`StatusEntitlement.Baseline`).
- Runtime iteration (helpful in tests and for emitting the entitlement list back to the SDK).
- A single string-valued definition (`Authorized = 'authorized'`) so the runtime value is the same string the SDK has historically used.

`const enum` is rejected because the connector is bundled with `ncc` and `const enum` inlining can interact poorly with bundler output. A string-literal union type is rejected because the user asked for an enum and a literal union does not produce a runtime value the entitlement list can iterate over.

### Decision 2: File location `src/model/statusEntitlement.ts`, name `StatusEntitlement`

The class `Status` already lives in `src/model/status.ts` and represents an entitlement *object*. Naming the new identifier `Status` would shadow or conflict with the class (depending on import ordering in modules that import both). `StatusEntitlement` mirrors the existing `Entitlement` class naming and is unambiguous. The filename `statusEntitlement.ts` follows the project's existing `camelCase.ts` convention for model files (e.g., `fusionAccount.ts`).

### Decision 3: `FusionAccount` API stays `string`-typed

Persisted fusion accounts round-trip the `statuses` array as `string[]` in the SDK attribute bag. Tightening `addStatus(status: StatusEntitlement)` would break loading accounts whose statuses were persisted with strings that don't match a current enum member (e.g. an old connector that wrote a now-removed status). The enum is the *internal* vocabulary; the boundary stays string-typed. Internally, every internal call site uses the enum.

### Decision 4: One member per status, exact string match

Each enum member's string value is the existing ID verbatim:

```ts
export enum StatusEntitlement {
    Authorized     = 'authorized',
    Auto           = 'auto',
    Baseline       = 'baseline',
    Manual         = 'manual',
    Orphan         = 'orphan',
    NonMatched     = 'nonMatched',
    Reviewer       = 'reviewer',
    Requested      = 'requested',
    Uncorrelated   = 'uncorrelated',
    ActiveReviews  = 'activeReviews',
    Candidate      = 'candidate',
}
```

No new IDs are introduced; no existing IDs change. This keeps the serialized format bit-identical.

### Decision 5: `data/status.ts` derives from the enum

```ts
import { StatusEntitlement } from '../model/statusEntitlement'

export const statuses: EntitlementSource[] = [
    { id: StatusEntitlement.Authorized,     name: 'Authorized',     description: '...' },
    { id: StatusEntitlement.Auto,           name: 'Auto',           description: '...' },
    ...
]
```

This makes the data file the *consumer* of the enum. If a status is added in the enum, the data file is the next place a developer must edit, and the missing entry is obvious.

### Decision 6: Replace literals at every call site we own

Every internal `addStatus` / `removeStatus` / `hasStatus` argument and every `_statuses.add` / `_statuses.delete` / `_statuses.has` / `set.has` literal in:

- `src/model/fusionAccount.ts`
- `src/services/fusionService/decisionProcessor.ts`
- `src/services/fusionService/fusionService.ts`
- `src/operations/accountCreate.ts`
- `src/operations/helpers/dryRunHelpers.ts`
- All affected `__tests__` files

…is replaced with the matching `StatusEntitlement.*` member. Persisted `statuses: ['baseline']` arrays inside test fixtures and `buildPersistedAccount` calls are left as string literals on purpose — they simulate data read from storage, not code writing new statuses.

### Decision 7: Lock the contract with a unit test

A new test file `src/model/__tests__/statusEntitlement.test.ts` asserts:

1. Every `StatusEntitlement` value appears as an `id` in `statuses`.
2. Every `id` in `statuses` is a `StatusEntitlement` value.
3. The enum has exactly 11 members (current count), to catch accidental additions/removals.

## Risks / Trade-offs

- **[Risk] `FusionAccount` stays `string`-typed, so a developer can still pass a typo from outside the enum.** → Mitigation: the new test in `src/model/__tests__/statusEntitlement.test.ts` documents the contract; all call sites we own are migrated in this change; a follow-up issue can tighten the API to `StatusEntitlement` in a breaking-change release.
- **[Risk] Drift between enum and `data/status.ts` if someone adds a status only in one place.** → Mitigation: the unit test fails if either side diverges. The test runs in `npm test`.
- **[Risk] Bundle size from the enum is negligible but non-zero.** → Mitigation: the enum is 11 string members; impact is well under 1 KB after `ncc`.
- **[Trade-off] Two files (`status.ts` and `statusEntitlement.ts`) for two related concepts.** → Accepted: the alternative (renaming the class) is out of scope and the current names accurately describe what each file exports.

## Migration Plan

This is an internal refactor; no data migration. The change is shipped in one PR with `npm run lint` and `npm test` green. Rollback is `git revert` of the single commit — serialized `statuses` payloads use the same string values, so older and newer connector versions can read each other's data.

## Open Questions

None. The naming collision with the existing `Status` class is resolved by choosing `StatusEntitlement`; the public API surface stays `string`-typed to avoid a breaking change; the enum and the data file are kept in lockstep by a unit test.
