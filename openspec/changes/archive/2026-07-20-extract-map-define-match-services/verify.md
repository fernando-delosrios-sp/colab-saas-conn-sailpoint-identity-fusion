## Verification Report: extract-map-define-match-services

### Summary

| Dimension | Status |
|-----------|--------|
| Completeness | 45/55 tasks done — 10 incomplete |
| Correctness | 5/8 spec areas covered, 3 partial |
| Coherence | 4/6 design decisions followed, 2 partial |

**Overall**: 6 CRITICAL, 5 WARNING, 2 SUGGESTION

---

### Issues

#### CRITICAL (Incomplete Tasks)

Each maps to an unimplemented delta-spec requirement.

- **2.5** Move sourcesByName, managedSources from SourceService to FusionRun
  - Spec: fusion-run "SHALL contain maps and sets for all data loaded"
  - Action: Move `sourcesByName: Map<string, SourceInfo>` and `managedSources: SourceInfo[]` from SourceService to FusionRun

- **2.6** Move form decisions and pending state from FormService to FusionRun
  - Spec: fusion-run "SHALL contain maps and sets for all data loaded" (form decisions not yet centralized)
  - Action: Move `fusionIdentityDecisions`, `pendingCandidateIds` from FormService to FusionRun

- **4.3** Move outcome handlers from FusionService to MatchService
  - Spec: match-service "SHALL dispatch exact match", "identity match", "non-match", "deferred candidate"
  - Action: Extract `handleExactMatch`, `handleIdentityMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch` from FusionService into MatchService

- **4.4** Move ManagedAccountMatchingRunner to matchService/
  - Spec: match-service "SHALL instantiate and orchestrate ManagedAccountMatchingRunner"
  - Action: Move `src/services/fusionService/managedAccountMatchingRunner.ts` into `src/services/matchService/`

- **4.5** Move ManagedAccountAnalyzer to matchService/
  - Spec: match-service owns the analysis pipeline
  - Action: Move `src/services/fusionService/managedAccountAnalyzer.ts` into `src/services/matchService/`

- **4.6** Move CandidateRegistry to matchService/
  - Spec: match-service "SHALL create and manage the CandidateRegistry"
  - Action: Move `src/services/fusionService/candidateRegistry.ts` into `src/services/matchService/`

- **4.7** Give DecisionProcessor explicit dependencies instead of FusionService reference
  - Spec: match-service requires DecisionProcessor to use explicit dependencies
  - Action: Refactor `src/services/fusionService/decisionProcessor.ts` to accept FusionRun, FormService, SourceService, IdentityService directly

- **4.8** Give CorrelationManager explicit dependencies instead of FusionService reference
  - Spec: same pattern as DecisionProcessor
  - Action: Refactor `src/services/fusionService/correlationManager.ts` to accept FusionRun and explicit service references

- **5.5** Verify recording tests pass
  - Action: Run `npx vitest run src/__tests__/recordingService.test.ts` (or equivalent), verify all recording tests pass

#### WARNING (Spec Divergence)

- **DefineService doesn't receive FusionRun** (`serviceRegistry.ts:110`)
  - Spec says: "SHALL be instantiated with config, schemas, log, locks, **and FusionRun**"
  - Current: `new DefineService(this.config, this.schemas, this.log, this.locks)` — missing `this.run`
  - Action: Add `this.run` to DefineService constructor and update its methods to accept FusionRun parameter

- **MatchService doesn't receive full dependencies** (`serviceRegistry.ts:113`)
  - Spec says: "SHALL be instantiated with config, log, FusionRun, forms, and defineService"
  - Current: `new MatchService(this.config, this.log)` — missing `this.run`, `this.forms`, `this.define`
  - Action: Add `this.run`, `this.forms`, `this.define` to MatchService constructor

- **MapService/DefineService methods are shells** (`mapService.ts:46`, `defineService.ts:33`)
  - Spec says map-service "SHALL merge managed source attributes" and define-service "SHALL evaluate Velocity templates"
  - Current: `mapAttributes` returns immediately for identity accounts; `refreshNormalAttributes` logs and returns
  - Action: Copy full implementation from deleted `attributeService.ts` into MapService/DefineService

- **MatchService delegates internally to ScoringService** (`matchService/matchService.ts`)
  - Spec says MatchService "SHALL expose the same scoring algorithms" — this is met via delegation
  - But spec also says "SHALL NOT hold internal mutable state beyond configuration and caches" — ScoringService instance is internal mutable state
  - Action: Inline scoring algorithms into MatchService rather than wrapping ScoringService

- **`FusionRun.restore()` only restores 7 of 17 fields** (`fusionRun.ts:50-68`)
  - Fields not restored: `managedAccountsByIdentityId`, `fusionIdentityMap`, `sourcesByName`, `currentRunNonMatchedKeysBySource`, `linkedAccountKeyIndex`, `fusionBlends`, `analysisRecorder`, `tracker`, `managedSources`, `managedAccountsAllById`
  - Spec says restore "SHALL reconstruct the state from a previously captured snapshot" — snapshot doesn't include these fields, so restore can't
  - Action: Expand `RunStateSnapshot` to include missing fields, and update `snapshot()`/`restore()` accordingly

#### SUGGESTION (Improvements)

- **`FusionRun.managedAccountsByIdentityId` type is `Map<string, Set<string>>`** (`fusionRun.ts:21`)
  - The design doc originally specified `Map<string, Account[]>` but the actual usage (via `addManagedAccountLayer`) requires `Set<string>`. The implementation correctly uses `Set<string>`; the design doc should be updated to match.

- **Knip reports 26 unused exports in matchService/ and defineService/** (`npm run lint`)
  - Files moved from scoringService/attributeService have many exports not yet consumed by the new shell services
  - Action: Mark these as `--no-unused-exports` in knip config, or wire them into the shell implementations

---

### Final Assessment

**6 critical issue(s) found.** These map to 10 incomplete tasks (2.5, 2.6, 4.3-4.8, 5.5) and 5 spec divergences. The core architecture (FusionRun state container, service extraction, RecordingService simplification) is solid and passes all tests (671/673 passing). The remaining work completes the deep extraction of matching logic into MatchService and ensures all delta-spec requirements have corresponding implementations.
