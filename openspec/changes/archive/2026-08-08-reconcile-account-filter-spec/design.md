## Context

Identity Fusion account-list runs a full aggregation pipeline. Managed account subsetting for performance happens in **Phase 2 Fetch** when `SourceService` calls the ISC Accounts API with a composed `filters` query built from per-source **Accounts API filter** configuration (`accountFilter`). JMESPath filtering is a separate, client-side pass after each page returns.

The drift audit compared account-list spec language to account-list handler code and missed that filtering is delegated to source-service at fetch time.

## Goals / Non-Goals

**Goals:**

- Make account-list and source-service specs accurately describe fetch-time Accounts API filter behavior.
- Eliminate the false impression that account-list accepts list-input filter criteria.
- Preserve cross-capability traceability (account-list Fetch → source-service filters).

**Non-Goals:**

- Implement operation-input filtering.
- Change runtime filter behavior (already correct).
- Reconcile unrelated account-list drift (dry-run summary fields, output step order).
- Update ubiquitous-language or user docs unless spec merge exposes a direct contradiction (glossary is already correct).

## Decisions

### D1 — Spec-only reconciliation

No code changes. Existing tests (`buildIscAccountsQueryFilter`, `fetchManagedAccounts` with `accountFilter`) provide behavioral evidence.

### D2 — Account-list scenario rewrite

Replace "invoked with filter criteria" with configuration-gated language:

- **GIVEN** a managed source with Accounts API filter configured
- **WHEN** account-list Fetch runs
- **THEN** managed accounts failing the API filter are not fetched, processed, or emitted as new fusion rows from that source fetch

Add explicit note that scope narrowing is not list-input criteria and point to source-service spec.

### D3 — Source-service scenario split

| Filter type | Config key | Applied where | Mechanism |
|-------------|------------|---------------|-----------|
| Accounts API filter | `accountFilter` | ISC `listAccounts` request | `buildIscAccountsQueryFilter` |
| Accounts JMESPath filter | `accountJmespathFilter` | After each page | `compileAccountPageJmespathFilter` |

Rename/fix the existing scenario that mislabels API filter syntax as JMESPath.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Future readers still look at account-list handler for filter parsing | Cross-reference source-service in account-list requirement prose |
| Over-specifying fusion output (identity-origin rows still appear) | Scenario limits claim to managed fetch scope, not absolute row count |

## Migration Plan

1. Apply spec deltas from this change.
2. Archive change to merge into canonical `openspec/specs/`.
3. Downgrade or annotate account-list filter entry in spec drift report.
