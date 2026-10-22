## Context

Large account-list aggregations crash against the connector runtime's ~4GB heap cap (V8 default old-space; not operator-tunable in the ISC cloud runtime). Peak residency occurs in Process, when all of the following coexist: every managed source account body (work queue, then claimed account retention after claim), the raw Fusion account fetch cache (`fusionAccountsByNativeIdentity`), all derived Fusion accounts, and the candidate-blocking indexes.

Two amplifying facts from the code:

- `FusionLayers.copyManagedAccountSnapshot` spreads a managed account's full `attributes` onto `attributeBag.sources`, so one wide fetched body is copied into per-Fusion-account snapshots.
- `FusionRun.retainClaimedAccount` retains the same object reference after claim, so claimed bodies stay resident until Output — meaning every managed account body is resident for the whole run regardless of claim timing.

Meanwhile the raw Fusion account cache's only accountList reader is `processFusionAccounts` (Refresh). After Refresh it is dead weight until the existing post-epilogue clear.

## Goals / Non-Goals

**Goals:**

- Cut peak heap for large aggregations with no change to streamed account output.
- Guarantee functional parity: pruning must never drop an attribute any configured feature can read.
- Keep record/replay capture fidelity (client layer captures raw pages).

**Non-Goals:**

- Streaming or paged managed-account processing (deferred; needs heap evidence that pruning is insufficient).
- Disk-backed account stores.
- Slimming derived Fusion accounts (they must live until Output by design).
- Synthetic data generator / memory benchmark harness (follow-up change).

## Decisions

### D1: Prune at Bulk ingest, after filters

- **Choice**: Prune managed source account `attributes` during page registration in `fetchManagedAccounts` (and the single-account fetch paths), after Accounts API filter, Accounts JMESPath filter, and machine-account discard.
- **Reason**: filters must evaluate on full bodies; everything downstream of registration (work queue, claimed account retention, source snapshot materialization) inherits the pruned body for free. Recordings capture raw pages at the client adapter, so capture fidelity is untouched and replay prunes identically.
- **Considered alternatives**: pruning at absorb (too late — queue and retention already paid the cost); pruning at HTTP capture (corrupts recordings).

### D2: One global referenced attribute set per run

- **Choice**: Compute a single run-scoped referenced attribute set — the union across all managed sources of: Fusion schema attribute names, `attributeMaps[].existingAttributes`, attribute names textually referenced in Define/unique/form Velocity templates, and match rule attribute names.
- **Reason**: per-source sets risk dropping attributes a template reads cross-source (`$sources.get('AD')[0].department`); the global union over-keeps safely and is one computation per run.
- **Considered alternatives**: per-source keep-sets (tighter but fragile cross-source); keep-everything-on-template-sources (coarse, unpredictable).

### D3: Schema names always kept (implicit Map merge parity)

- **Choice**: Every Fusion schema attribute name is in the referenced set, even when unmapped.
- **Reason**: Map's implicit merge promotes unmapped snapshot keys onto the bag; schema-named managed attributes are therefore output-reachable and must survive pruning. Non-schema unmapped attributes never reach the schema-subset output.
- **Considered alternatives**: keep only mapping inputs (breaks implicit-merge output parity).

### D4: Claimed account retention slims by inheritance — no separate change

- **Choice**: No code change to retention. It stores the same references the work queue held, so ingest pruning (D1) slims it automatically.
- **Reason**: the originally discussed "retain only needed attributes" is exactly the referenced attribute set, already applied at ingest.
- **Considered alternatives**: eager rematerialization at claim time then drop the body — rejected; it defeats claim-only absorb (archived `skip-unchanged-managed-snapshots` performance work).

### D5: Clear the raw Fusion account fetch cache at end of Refresh

- **Choice**: `refreshPhase` clears `fusionAccountsByNativeIdentity` after `processFusionAccounts`, except in record mode; the existing post-epilogue clear stays as the record-mode safeguard.
- **Reason**: verified sole accountList reader is Refresh. Single-account operations fetch their own copy. Report epilogue resolves ids via FusionRun maps and `managedAccountInventory`; ReportService reads only `fusionAccountCount` (a size). Output-time JIT unique refresh reads derived Fusion accounts plus the unique-value registry populated from derived accounts during Refresh/Match — never the raw cache.
- **Considered alternatives**: clearing at start of Process (identical window, but Refresh-end is the natural owner and reads cleaner in phase logs).

### D6: Enforced, no configuration surface

- **Choice**: Pruning always runs; there is no setting to disable it.
- **Reason**: user direction — "not optional, enforced, if it works at no cost of functionality." A switch adds config surface and test matrix for a change whose release gate is functional parity anyway: if pruning is transparent, the switch is dead weight; if it isn't, the switch masks a bug. Parity is guaranteed by the conservative referenced attribute set (D2/D3) — any attribute name textually present in any config template string is kept.
- **Considered alternatives**: default-on with opt-out setting (rejected — dead config once parity is proven); default-off (toothless).

## Risks / Trade-offs

- [Risk] A Velocity template accesses attributes dynamically (`$account[$attrName]`), which textual scanning cannot detect → pruned attribute reads as undefined with no opt-out. Mitigation: conservative textual scan across all config template strings (including bracket/quoted reference styles); characterization tests across every template-consuming feature; if a dynamic pattern surfaces in the wild, the fix is a patch broadening detection.
- [Risk] A missed code consumer of raw managed attributes (beyond system fields and the referenced set) → wrong output. Mitigation: characterization tests per consumer (Map implicit merge, Define `$sources`/`$accounts`, Match attribute reads, form accountInfo — verified to use system fields only) plus full `npm test` and `npm run test:scenario`.
- [Trade-off] Memory win is unquantified until the synthetic generator exists → accepted; payload math (wide managed bodies ×3 residency) makes the direction certain, measurement is a follow-up.
- [Trade-off] If the derived Fusion account population dominates heap (not raw bodies), pruning will not be enough → accepted; streaming is the documented follow-up, gated on heap evidence.

## Migration Plan

N/A — no deployment, schema, state, or configuration changes. Pruning is enforced; functional parity (full test suite + scenario replay) is the release gate.

## Open Questions

None.
