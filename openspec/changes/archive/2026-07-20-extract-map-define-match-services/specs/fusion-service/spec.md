> **Archive note (2026-08-09):** Terminology in this delta reflects the change at archive time. Current canonical terms: **`MatchOutcomeDispatcher`** (replaces `ManagedAccountPassRunner` / `ManagedAccountMatchingRunner`); **`configureScoring({ captureBreakdown })`** (replaces `setCaptureBreakdown`). See `openspec/changes/archive/README.md` and living specs after `reconcile-matching-delegation-spec`.

# fusion-service Spec (Delta)

## MODIFIED Requirements

### Requirement: FusionService delegates matching to MatchService

FusionService SHALL delegate all managed account matching to MatchService. FusionService SHALL NOT directly call scoring methods, manage candidate registries, or orchestrate matching sweeps.

#### Scenario: Uncorrelated managed accounts delegated to MatchService
- **WHEN** processUncorrelatedManagedAccounts is called
- **THEN** MatchService.processUncorrelatedManagedAccounts SHALL be invoked with FusionRun
- **AND** FusionService SHALL NOT call ManagedAccountMatchingRunner directly

#### Scenario: Process phase delegates matching
- **WHEN** the process phase runs in the pipeline
- **THEN** MatchService SHALL handle all match sweep orchestration
- **AND** FusionService SHALL only call MatchService entry points

### Requirement: FusionService receives state via FusionRun

FusionService SHALL access all shared run state through FusionRun at construction time. Internal maps previously held on FusionService (fusionAccountMap, fusionIdentityMap, autoAssignedIdentityIds, analysisRecorder) SHALL move to FusionRun.

#### Scenario: FusionService reads fusion accounts from FusionRun
- **WHEN** FusionService needs to iterate fusion accounts
- **THEN** it SHALL read from run.fusionAccountMap, not this.fusionAccountMap

### Requirement: FusionService retains pipeline orchestration

FusionService SHALL retain responsibility for pipeline phase coordination (setup, fetch, refresh, process, output), reviewer management, identity processing delegation, ISC account output, and report generation.

#### Scenario: Pipeline phases still orchestrated by FusionService
- **WHEN** the aggregation pipeline runs
- **THEN** phase transitions SHALL be coordinated by FusionService
- **AND** MapService, DefineService, and MatchService SHALL be invoked at the appropriate phase boundaries

## REMOVED Requirements

### REMOVED: FusionService SHALL own a CandidateRegistry collaborator

**Reason:** CandidateRegistry ownership moves to MatchService as part of the matching concern extraction.

**Migration:** Callers that previously accessed `this.candidateRegistry` on FusionService SHALL access it through MatchService instead.

### REMOVED: CandidateRegistry SHALL register accounts keyed by source

**Reason:** CandidateRegistry requirements move to match-service spec.

**Migration:** No code changes — CandidateRegistry is relocated, not removed.

### REMOVED: CandidateRegistry SHALL query candidates per source

**Reason:** CandidateRegistry requirements move to match-service spec.

**Migration:** No code changes — CandidateRegistry is relocated, not removed.

### REMOVED: CandidateRegistry SHALL be clearable for initialization

**Reason:** CandidateRegistry requirements move to match-service spec.

**Migration:** No code changes — CandidateRegistry is relocated, not removed.

### REMOVED: FusionService SHALL own a ManagedAccountMatchingRunner collaborator

**Reason:** ManagedAccountMatchingRunner ownership moves to MatchService.

**Migration:** Instantiation moves from FusionService constructor to MatchService constructor.

### REMOVED: ManagedAccountMatchingRunner SHALL execute two-sweep analysis

**Reason:** ManagedAccountMatchingRunner requirements move to match-service spec.

**Migration:** No code changes — ManagedAccountMatchingRunner is relocated, not removed.

### REMOVED: ManagedAccountMatchingRunner SHALL return structured results without side effects

**Reason:** ManagedAccountMatchingRunner requirements move to match-service spec.

**Migration:** No code changes.

### REMOVED: ManagedAccountMatchingRunner SHALL report progress during execution

**Reason:** ManagedAccountMatchingRunner requirements move to match-service spec.

**Migration:** No code changes.

### REMOVED: FusionService SHALL delegate uncorrelated scoring sweep to the runner

**Reason:** Sweep dispatch moves to MatchService. FusionService calls MatchService instead of calling the runner directly.

**Migration:** `runUncorrelatedManagedAccountSweep` becomes a delegation to MatchService.

### REMOVED: FusionService SHALL use runner for single-account analysis in processManagedAccount

**Reason:** processManagedAccount moves to MatchService.

**Migration:** Callers invoke MatchService.processManagedAccount instead.

### REMOVED: FusionService SHALL call recordAnalysis exactly once per account

**Reason:** Record analysis moves to MatchService as part of the matching concern.

**Migration:** Record analysis is called by MatchService after each runner result.
