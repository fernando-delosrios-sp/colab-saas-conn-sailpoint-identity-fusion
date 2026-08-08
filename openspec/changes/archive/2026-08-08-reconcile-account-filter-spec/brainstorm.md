# Brainstorm: Reconcile account-filter spec drift

## Background

A spec drift audit flagged **account-list filters** as high severity: spec says list-input filter criteria should narrow streamed accounts; code has no `StdAccountListInput` filter handling.

Exploration with the product owner clarified intent: the scenario refers exclusively to **Source Configuration → Sources → Accounts API filter** (`accountFilter`), applied server-side at fetch time via `buildIscAccountsQueryFilter`. That is the performance-critical filter; it is not operation invocation input.

## Decision chain

### D1 — Code gap or spec gap?

**Context:** Drift report compared `account-list-operation/spec.md` L14–16 to `accountList.ts` / `accountListPhases.ts` and found no list-input filter parsing.

**Decision:** **Spec gap.** Code already applies `accountFilter` during `fetchManagedAccounts` → `fetchAccountsBySourceIdGenerator` → `listAccounts(filters=...)`. Account-list Fetch phase calls that path. Tests exist in `accountJmespathFilter.test.ts` and `sourceService.test.ts`.

**Alternative considered:** Implement SDK `Filter` class on operation input. Rejected — wrong layer, contradicts Fusion architecture, no platform input field exists.

### D2 — Where should the contract live?

**Context:** Misleading scenario sits under `account-list-operation`; fetch-time filter behavior is implemented in `source-service`.

**Decision:** **Primary contract in `source-service`** with explicit Accounts API filter vs JMESPath filter scenarios. **Account-list spec** gets a cross-reference scenario under Fetch scope, not a duplicate filter requirement framed as invocation input.

### D3 — Wording for account-list outcome

**Context:** Spec says "stream only accounts matching filter criteria." Fusion output streams all eligible fusion rows built from the scoped run (managed fetch filtered + identity scope + existing fusion rows).

**Decision:** Account-list scenario SHALL state that **managed accounts excluded by Accounts API filter do not enter processing or output as new fusion rows from that fetch**, and SHALL cross-reference source-service for filter application. Avoid implying post-output row filtering or list-input criteria.

### D4 — Fix source-service terminology error

**Context:** Existing source-service requirement says filters are applied "via jmespath" and the example scenario is titled "A jmespath filter" but uses ISC search syntax (`attributes.active eq true`) — that is Accounts API filter, not JMESPath.

**Decision:** Split into two scenarios: **Accounts API filter** (server-side, `accountFilter` config) and **Accounts JMESPath filter** (client-side page filter). Update requirement prose accordingly.

### D5 — Scope: spec-only

**Context:** Behavior matches intent; no production code change required.

**Decision:** Spec reconciliation only. Update drift report note separately (out of scope for this change). No new runtime filter features.

## Trade-offs

| Trade-off | Decision |
|-----------|----------|
| Remove vs rewrite account-list filter scenario | Rewrite as cross-ref + scoped outcome (preserves traceability for auditors) |
| Touch ubiquitous-language spec | Defer — glossary already defines Account filter vs JMESPath filter correctly |
| Bundle dry-run terminal summary drift | Out of scope — separate change |

## Agreed approach

Spec-only change `reconcile-account-filter-spec`: fix misleading account-list scenario, correct source-service filter terminology, add explicit Accounts API filter scenario. No code changes.
