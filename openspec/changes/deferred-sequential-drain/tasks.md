## 1. CandidateRegistry and FusionRun seeding

- [x] 1.1 Add persisted / anchor / pending tiers to `CandidateRegistry`; key by `originAccount` when present; prevent pending overwrite of persisted entries
- [x] 1.2 Expose `registerPersistedDeferredCandidate`, `registerAnchorDeferredCandidate` (alias of `registerFinalizedDeferredCandidate`) on `FusionRun`; update `fusionService.initializeManagedAccountProcessing` to seed `fusionAccountMap` and `fusionIdentityMap`
- [x] 1.3 Extend `candidateRegistry.test.ts` for persisted seed protection and originAccount keying

## 2. Sequential deferred drain in MatchOutcomeDispatcher

- [x] 2.1 Replace frozen two-pass `scoreManagedAccounts` deferred phase with per-source sequential drain loop (deterministic `managedKey` order)
- [x] 2.2 On non-match during drain: materialize incoming account as anchor in registry
- [x] 2.3 On deferred match: claim incoming; materialize all matched **pending** candidates; remove from queue/registry
- [x] 2.4 Remove bulk `registerDeferredCandidate` during identity pass; keep identity scoring parallel
- [x] 2.5 Remove tier-based `hasActionableDeferredCandidateMatches` heuristic if present (superseded by drain)

## 3. Tests

- [x] 3.1 Add clique test: N similar accounts → 1 non-match + (N−1) deferred
- [x] 3.2 Add two-run test: persisted anchors + peer cluster → new non-matches on second run
- [x] 3.3 Update `matchOutcomeDispatcher.test.ts` same-sweep pair test for drain semantics
- [x] 3.4 Update `deferredEndToEnd.test.ts` for persisted seed via init path

## 4. Verification and docs

- [x] 4.1 Run `npm test` and `npm run lint`
- [ ] 4.2 Re-run local dry-run scenario (36 accounts, two passes) and confirm second run creates non-match progress _(deferred — covered by automated clique + persisted-anchor tests; run manually before production validation)_
- [x] 4.3 Update ubiquitous-language or matching-service spec cross-references if deferred drain term is added
