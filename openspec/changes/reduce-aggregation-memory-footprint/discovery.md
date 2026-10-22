## Scope

In: reduce peak heap of large account-list aggregations by (1) pruning managed source account attributes not referenced by connector configuration at Bulk ingest, (2) clearing the raw Fusion account fetch cache (`fusionAccountsByNativeIdentity`) after Refresh. Out: streaming/paged managed-account processing, disk-backed stores, derived `FusionAccount` slimming, synthetic data generator for memory benchmarking (all deferred).

## Language

**Attribute pruning** (`promote`):
Dropping managed source account `attributes` entries that are not in the referenced attribute set during Bulk ingest, before work-queue registration. Applies to managed source accounts only, never to raw Fusion accounts (whose attributes are the previous Fusion bag).
_Avoid_: strip, trim, slim (ambiguous with payload lifetime changes)

**Referenced attribute set** (`promote`):
The run-scoped union of attribute names that managed source account pruning keeps: Fusion schema attribute names (implicit Map merge targets), `attributeMaps[].existingAttributes`, attribute names textually referenced in Define/unique/form Velocity templates, and match rule attribute names.
_Avoid_: keep-list, allowlist, whitelist

**Claimed account retention** (`conflicts-with-canonical` — reuse, do not redefine):
Canonical FusionRun term (post-claim attribute bodies for FusionLayers rematerialization). Retention stores the same object references the work queue held, so pruning at ingest slims retention with no separate code change.
_Avoid_: second work queue, retained copy

## Decisions

Context: Peak heap sits in Process with all of these resident: every managed source account body (work queue + claimed account retention), the raw Fusion account fetch cache, all derived Fusion accounts, and blocking indexes. `copyManagedAccountSnapshot` spreads full managed `attributes` onto `attributeBag.sources`, so one fetched body can be amplified into per-Fusion-account snapshots. Runtime heap cap ~4GB (V8 default old-space); large aggregations crash.

Q1: Slim the biggest pool (managed source account bodies) or restructure the pipeline (streaming/disk)?
Chosen: **Slim payloads first.** Managed source accounts are the widest raw pool and most of their attributes are never read. Structural streaming remains a follow-up if pruning is insufficient.

Q2: Where to prune — HTTP capture, page registration, or absorb?
Chosen: **Bulk ingest (page registration)**, after Accounts API filter, Accounts JMESPath filter, and machine-account discard. Filters must see full bodies; everything after registration (work queue, claimed account retention, source snapshot materialization) inherits the pruned body. Recordings capture raw pages at the client layer, so record/replay stays byte-identical at capture and prunes identically at registration.

Q3: How to compute what to keep — per-source or global?
Chosen: **One global referenced attribute set per run** (union across sources). Per-source sets risk dropping attributes a template reads cross-source; global union over-keeps safely and is simpler.

Q4: Does the implicit Map merge break if unmapped attributes are pruned?
Chosen: **Fusion schema attribute names are always in the referenced set.** Unmapped snapshot keys merge onto the bag only when a live snapshot carries them; schema-named attributes are therefore preserved and output parity holds. Non-schema unmapped attributes were never output-reachable (they land on the bag but not in the schema-subset output) except via Velocity `$accounts`/`$sources` reads — covered by textual template reference scan.

Q5: Slim claimed account retention separately (the user's item 3)?
Chosen: **No separate change.** Retention holds the same object references the work queue held (`retainClaimedAccount` copies the reference, not the object); pruning at ingest slims retention automatically. Eager rematerialization at claim time was rejected — it defeats claim-only absorb (archived `skip-unchanged-managed-snapshots` change).

Q6: Clear raw Fusion account fetch cache — safe after Refresh?
Chosen: **Yes, at end of Refresh** (after `processFusionAccounts`), skipped in record mode. Verified readers in the accountList path: only `processFusionAccounts` (Refresh). `registerUniqueValuesFromManagedSourceAccounts(sources.fusionAccounts)` is exclusive to single-account operations which fetch their own copy. Report path resolves ids via FusionRun maps + `managedAccountInventory`; ReportService reads only `fusionAccountCount` (a size). Output-time JIT unique refresh reads derived Fusion accounts + the unique-value registry (populated from derived accounts during Refresh/Match), never the raw cache. The existing late clear in `accountList` stays as a record-mode safeguard.

Q7: Pruning default-on with opt-out, opt-in, or enforced?
Chosen: **Enforced, no setting** (user direction): pruning always runs, conditional on zero functionality loss. The referenced attribute set must therefore be conservative — any attribute name textually present in any config template string is kept. Velocity templates that compute attribute names dynamically (`$account[$name]`) are the one undetectable pattern; they are unsupported under pruning, and the remedy if one surfaces is a patch broadening detection, not a config escape hatch.

## Open questions

None blocking. Assumption: the conservative textual template reference scan covers all realistic Velocity attribute access; dynamic computed access is unsupported under enforcement. Deferred: synthetic data generator to quantify peak-heap reduction (owner: follow-up change); streaming/paged managed fetch if pruning proves insufficient (needs heap evidence first).

## Scenarios discussed

- Managed account with 50 source attributes, 8 referenced → 42 dropped at ingest; work queue, retention, and snapshots all carry only the 8 + system fields.
- Unmapped attribute whose name matches a Fusion schema attribute → kept (implicit Map merge / output parity).
- Attribute referenced only inside a Define Velocity template (`$sources.get('AD')[0].department`) → kept via textual scan.
- Accounts JMESPath filter references an attribute not in the referenced set → filter still works (filtering precedes pruning).
- Machine account discard precedes pruning (no wasted work on discarded accounts).
- Template reads via bracket notation or quoted keys (`$accounts[0]['custom-attr']`, `$account.employeeNumber`) → kept via textual scan (pruning is enforced; these must work).
- Record mode: capture stays raw at client layer; pruning applies at registration in both record and live runs.
- Aggregation with unique definitions where an account needs last-minute JIT unique refresh at Output → still correct after the raw Fusion cache is cleared post-Refresh.
- Report epilogue after early clear → account id resolution unchanged (FusionRun maps + `managedAccountInventory`).
- Single-account operations (accountRead/accountUpdate/accountEnable/accountDisable/accountCreate) → unaffected; they fetch their own raw Fusion account copy.
