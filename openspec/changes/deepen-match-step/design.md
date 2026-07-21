## Context

The Fusion connector's Match step determines whether a managed source account corresponds to an existing identity, a deferred candidate from the same source, or a new identity. The ubiquitous-language spec assigns this step to **MatchingService** and defines **FusionRun** as the single source of truth for all mutable run-scoped state.

After recent refactors, the implementation is split across `matchingService/` (scoring), `fusionService/` (outcome dispatch and orchestration), and `formService/` (review forms). The split produced circular package imports (`matchingService → fusionService/helpers`, `matchingService → formService/helpers`, `formService → matchingService/types`) and duplicated glue code (`isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, `applyAttributeProcessing`, `addManagedAccountLayer`, the resolution switch). `ManagedAccountOutcomeHandler` depends on 18 constructor parameters, 7 of which are closures over private `FusionService` methods, so its interface is essentially `FusionService`'s implementation surface re-declared. The duplicated resolution switch exists in two places inside `fusionService.ts`.

The codebase uses TypeScript, Vitest, and a service-registry dependency-injection pattern. Connector operations are invoked through the SailPoint connector SDK. No connector-facing API changes are planned.

## Goals / Non-Goals

**Goals:**
- Deepen the Match step into one module, `MatchOutcomeDispatcher`, with a single public interface (`runMatchSweep`).
- Remove circular imports between `matchingService`, `fusionService`, and `formService`.
- Replace the duplicated resolution switches and closure-based dependencies with real collaborators behind explicit seams.
- Extract the shared account-assembly recipe so `identityProcessor`, `decisionProcessor`, and the Match module share one implementation.
- Clean up `FusionRun` enough to become the truthful state seam for the Match module (dead fields, duplicate maps, tracker/recorder access).
- Add the domain term **Match outcome dispatch** to the ubiquitous-language spec.

**Non-Goals:**
- Rewriting the scoring engine (`MatchingService`) — it stays a separate, well-tested module.
- Broad `FusionRun` consolidation beyond what the Match module needs (form counters, trigram index, full inventory absorption) — those remain for a follow-up change.
- Changing connector configuration, schema, or external behavior visible to ISC administrators.
- Re-architecting `clientService`, `messagingService`, or other unrelated services identified in the architecture review.

## Decisions

### D1 — Outcome dispatch lives inside the Match module
- **Choice:** `MatchOutcomeDispatcher` owns scoring, resolution dispatch, and outcome application (`handleExactMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch`).
- **Rationale:** Dispatch logic is Match-domain behavior; keeping it in `fusionService` leaves the duplicated switch in the hottest file and prevents the module from being deep.
- **Alternatives considered:** Returning typed outcomes to `FusionService` for dispatch — rejected because it preserves the duplicated switch and the wide plumbing interface.

### D2 — Extract the account-assembly recipe first
- **Choice:** Collapse the duplicated `preProcessManagedAccount` recipe (mode gates, `addManagedAccountLayer`, Map/Define, registration) into a single collaborator before building the dispatcher.
- **Rationale:** The recipe is needed by three processors and the Match module. Extracting it first deletes ~15 duplicated blocks and gives the dispatcher a real input seam rather than a `FusionService` closure.
- **Alternatives considered:** Injecting the recipe as a one-method interface now — rejected because it leaves the duplication in place and requires a second wiring pass.

### D3 — One-way dependency direction
- **Choice:** `fusionService → matchingService → model`; `formService` only consumes matching types.
- **Rationale:** Eliminates the `matchingService ⇄ fusionService` and `matchingService ⇄ formService` cycles. Match predicates belong with MatchingService; shared types belong in `model/`.
- **Alternatives considered:** Moving match predicates into `fusionService` — rejected because it would invert the correct domain ownership.

### D4 — `createAutomaticAssignmentDecision` stays in `formService`
- **Choice:** The synthetic `FusionDecision` factory remains a review-domain helper; `MatchOutcomeDispatcher` calls it through `FormService`.
- **Rationale:** The function builds a `FusionDecision` for symmetry with manual review decisions. Keeping it in `formService` keeps Match outcome dispatch focused on routing, not decision value construction.
- **Alternatives considered:** Moving it into `MatchOutcomeDispatcher` — rejected after user noted the intentional symmetry with manual review.

### D5 — `FusionRun` is the state seam for the Match module
- **Choice:** The dispatcher depends directly on `FusionRun` and uses run-level verbs (`queueDisableOperation`, `removeMatchAccount`, `trackFailed`).
- **Rationale:** The ubiquitous-language spec already names `FusionRun` as the single source of truth. Depending on a narrower fabricated interface would signal distrust in that seam.
- **Alternatives considered:** A dedicated `MatchRunState` interface — rejected because it duplicates `FusionRun`'s contract and conflicts with the spec.

### D6 — Public interface is `runMatchSweep(accounts, batchSize): MatchSweepResult`
- **Choice:** One verb per sweep; returns a value object with processed count, scoring time, resolution counts, and a `ResolvedMatch[]` list.
- **Rationale:** Gives tests a clear surface and lets `FusionService` feed the recorder in one pass. Per-account or void interfaces would re-introduce loop logic in `FusionService` or lose observability.
- **Alternatives considered:** `matchManagedAccount` per-account verb; `processManagedAccounts` fire-and-forget — both rejected.

### D7 — Clean `FusionRun` as a prerequisite commit
- **Choice:** Before creating the dispatcher, delete dead fields, dedupe `sourcesByName`, and move tracker/recorder access behind run verbs.
- **Rationale:** Building the dispatcher on a clean run seam avoids tacking on ad-hoc methods that later have to be re-consolidated.
- **Alternatives considered:** Minimal `FusionRun` additions only — rejected because it leaves tracker/recorder split as follow-up work that would re-touch the same code.

### D8 — Module location and name
- **Choice:** `MatchOutcomeDispatcher` inside `src/services/matchingService/`.
- **Rationale:** The spec assigns the Match step to MatchingService; keeping the dispatcher in the same package maintains domain locality. `Dispatcher` was preferred over `Step` by the user for explicitness.
- **Alternatives considered:** `ManagedAccountMatchStep` — renamed to `MatchOutcomeDispatcher` to emphasize the dispatch responsibility.

### D9 — Test strategy
- **Choice:** Characterization-first: pin current behavior via existing `fusionService.test.ts` before moving, then add unit tests for `MatchOutcomeDispatcher` through `runMatchSweep` using real `MatchingService` and mocked collaborators.
- **Rationale:** Prevents regressions during the refactor and validates the new seam. The wide surface of `fusionService.test.ts` shrinks as Match coverage moves.
- **Alternatives considered:** Rewriting tests after the move — rejected due to regression risk.

## Risks / Trade-offs

- **[Risk]** The `FusionRun` cleanup touches state used by multiple services (SourceService, FormService, FusionService) and could break `snapshot()`/`restore()` or recording.  
  **Mitigation:** Add characterization tests for `snapshot()`/`restore()` before changing fields; keep the JSON shape stable or migrate it explicitly.

- **[Risk]** `formatFusionMatchDiscoveryLog` is used by `ManagedAccountAnalysisRecorder` (in `fusionService`). Moving it to `matchingService` creates a `fusionService → matchingService` import, which is the desired direction but must not create a new cycle.  
  **Mitigation:** Verify the import graph after the move; ensure no `matchingService → fusionService` path reappears.

- **[Risk]** `FusionService.test.ts` is 3,068 lines and mocks internal call graphs. Removing Match-dispatch coverage from it without equivalent coverage elsewhere would reduce confidence.  
  **Mitigation:** Migrate key Match scenarios to `MatchOutcomeDispatcher` tests before deleting them from `fusionService.test.ts`.

- **[Trade-off]** We are doing `FusionRun` cleanup and module extraction in one change rather than two.  
  **Accepted because:** the cleanup is scoped to what the dispatcher needs; the two commits share the same reviewers and test surface.

- **[Risk]** `buildFusionBlend` is passed into outcome-handler deps but may be unused; dropping it could remove latent functionality.  
  **Mitigation:** Verify all references before deleting; if unused, remove it as dead code.

## Migration Plan

This change is a pure internal refactor; there is no deployment sequence beyond merging the PR.

1. **Commit 1 — `FusionRun` cleanup:** delete dead fields, dedupe `sourcesByName`, add `trackFailed`/`queueDisableOperation`/`removeMatchAccount` verbs, move `AggregationTracker` type toward `model/`.
2. **Commit 2 — cycle breaking:** move match predicates/types to their correct homes; replace `fusionService/helpers` imports from `matchingService`.
3. **Commit 3 — account-assembly extraction:** create the assembly collaborator and re-point `fusionService`, `identityProcessor`, and `decisionProcessor` to it.
4. **Commit 4 — `MatchOutcomeDispatcher`:** create the dispatcher, fold analyzer/runner/outcome handler, delete duplicated resolution switches, wire from `FusionService`.
5. **Commit 5 — spec update:** add **Match outcome dispatch** to `openspec/specs/ubiquitous-language/spec.md`.
6. **Commit 6 — test migration:** characterization tests + new unit tests.

**Rollback strategy:** revert the PR; there are no external state changes.

**Verification:** `npm run lint` and `npm test` must pass. Match behavior must be validated by existing scenario tests and new dispatcher unit tests.

## Open Questions

- Should `MatchOutcomeDispatcher` be a single file (`matchOutcomeDispatcher.ts`) or a small directory (`matchOutcomeDispatcher/`) with analyzer/runner/dispatch submodules? Decision deferred to implementation based on file size after extraction.
- Should `FormService` expose `registerAutomaticAssignmentDecision(...)` so `MatchOutcomeDispatcher` never imports the decision factory helper directly? Decision deferred until we see the helper's current call sites.
- What is the exact list of dead `FusionRun` fields? Needs a final pass over `fusionRun.ts` to confirm zero-callers.
- Does `buildFusionBlend` have any dynamic caller inside the outcome handler? Needs verification before removal.
