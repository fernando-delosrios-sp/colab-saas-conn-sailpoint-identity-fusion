<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Brainstorm — deepen Match step

## Background

The codebase is mid-migration: FusionRun encapsulation, processor extraction, and the move of managed-account matching components into `matchingService/` all landed in the last few weeks. The dominant remaining friction is **extraction without seam-formation**: logic was moved into new files, but the glue that makes the moves correct was duplicated rather than deepened.

The **Match** step (the product step owned by MatchingService per the ubiquitous-language spec) currently spans 6 files across 2 packages with circular imports and 18-member dependency bags. The resolution dispatch is duplicated twice inside `fusionService.ts`. The outcome handler depends on 7 closures over private FusionService methods. This directly violates the principle that a module's interface should be smaller than its implementation, and makes any change to matching workflow require coordinated edits in 3–4 files.

The user ran `/improve-codebase-architecture`, selected candidate 1, and we grilled the decision tree.

## Decision chain

### Q1 — Boundary: does outcome dispatch move into the Match module, or return outcomes for FusionService to dispatch?

- **A: dispatch moves in** (chosen)
- B: module returns typed outcomes, FusionService dispatches
- C: hybrid, form creation stays out

Rationale: the dispatch decisions (exact→auto-assign, partial→review form, deferred→claim, non-match→register) *are* the Match step's business logic per the spec. Returning outcomes would leave the duplicated switch in FusionService and keep the module shallow.

### Q2 — Account-assembly recipe: what does the Match module depend on to turn a managed source account into a provisional Fusion account?

- **A: extract the assembly recipe first as its own collaborator** (chosen)
- B: inject it as an interface now, extract later
- C: move the recipe into the Match module itself

Rationale: `preProcessManagedAccount` is the same recipe duplicated across fusionService, decisionProcessor, and identityProcessor. Injecting it as a closure keeps FusionService in the loop; moving it into Match pollutes a non-Match concern. Extracting first deletes the duplication and gives Match a real seam.

### Q3 — Cycle-breaking: where do shared pieces land?

Approved mapping:

| Piece | Moves to | Why |
|---|---|---|
| `hasIdentityCandidateMatches`, `hasDeferredCandidateMatches`, `countIdentityCandidateFusionMatches` | `matchingService` | Match predicates on `FusionMatch`; kills the match→form function import |
| `formatFusionMatchDiscoveryLog` | `matchingService` | Formats `FusionMatch` discovery logs |
| `createAutomaticAssignmentDecision` | stays in `formService` | Builds a `FusionDecision` value; review-domain symmetry |
| `yieldToEventLoop` | `utils/` | Generic runtime yield |
| `OperationContext`, `FusionReportBlend`, `UrlContext` | `model/` | Run/report vocabulary consumed by multiple packages |
| `AggregationTracker` | `model/` next to `FusionRun` | Run-scoped report state |

Result: one-way dependency: `fusionService → matchingService → model` (form still consumes matching types only).

### Q4 — The one verb: what does FusionService call?

- **A: `runMatchSweep(accounts, batchSize): MatchSweepResult`** (chosen)
- B: per-account verb `matchManagedAccount(account)`
- C: `processManagedAccounts(accounts): Promise<void>`
- D: stream

Result object contains `processed`, `matchScoringMs`, counts by resolution, and a `ResolvedMatch[]` list for the recorder.

### Q5 — Run-scoped state seam: what does the Match module depend on?

- **A: depend directly on `FusionRun`** (chosen)
- B: invent a narrower `MatchRunState` interface
- C: keep closures, reshaped

Add three verbs to `FusionRun`: `queueDisableOperation(account)`, `removeMatchAccount(id)`, `trackFailed(fusionAccount, message)`. This commits to the spec's stated single source of truth.

### Q6 — `analysisRecorder` non-null assertion: how does Match report failures?

- **A: push recorder access behind `FusionRun` verbs** (chosen)
- B: inject recorder directly
- C: keep `!`

`run.trackFailed(...)` hides the recorder; removes the ordering invariant hidden by `!`.

### Q7 — What does `runMatchSweep` return?

- **A: `MatchSweepResult` value object** (chosen)
- B: `{ processed, matchScoringMs }`
- C: `void`
- D: stream

### Q8 — How much of candidate 2 (FusionRun as single source of truth) do we fold in?

- A: minimal additions only
- **B: FusionRun cleanup package as the first commit** (chosen)

Do a coherent cleanup first: delete dead fields, dedupe `sourcesByName`, move tracker/recorder access behind run verbs. Then build the Match module.

### Q9 — Module name and new domain term

- **Module name:** `MatchOutcomeDispatcher`
- **Location:** `src/services/matchingService/`
- **New spec term:** `Match outcome dispatch` — routing a scored managed source account to one of four outcomes (exact match, partial match, deferred match, non-match) and applying the resulting action.

## Design trade-offs

| Approach | Pros | Cons |
|---|---|---|
| Dispatch inside `MatchOutcomeDispatcher` (chosen) | One seam, one test surface, deletes duplicated switch in FusionService | Module depends on FormService and CorrelationManager |
| Return outcomes to FusionService | "Decide vs act" separation | Keeps the switch and 18-dep plumbing in the hottest file |
| Extract assembly recipe first (chosen) | Deletes ~15 duplicated blocks; gives Match a real input seam | Slightly larger first commit |
| Inject assembly as closure now | Smaller first diff | Re-wire again in a second pass |
| FusionRun cleanup first (chosen) | Match module built on a truthful state seam | Touches FusionRun before the main goal is visible |
| Minimal FusionRun additions only | Smaller initial diff | Leaves tracker/recorder split as follow-up |

## Open detail

Whether `buildFusionBlend` in the current `ManagedAccountOutcomeHandlerDeps` is actually used or dead weight. We will verify during implementation and drop it if unused.

## Resolved shape

```text
Before:
  FusionService ──► Analyzer (new Analyzer(this))
              ──► Runner
              ──► OutcomeHandler (18 deps, 7 closures)
              [resolution switch duplicated ×2]
  matchingService ⇄ fusionService ⇄ formService (cycles)

After:
  FusionService.runMatchSweep(accounts, batchSize)
              └──► ▓ MatchOutcomeDispatcher ▓
                   ├─ analyzer (real deps, no this)
                   ├─ runner
                   ├─ outcome dispatch
                   └─ returns MatchSweepResult
                   depends on: FusionRun, FormService, CorrelationManager,
                               DefinitionService, MatchingService,
                               account-assembly module, config, log
```

## Decisions still pending implementation

- Exact `MatchSweepResult` fields and naming
- Whether `MatchOutcomeDispatcher` is a single file or a small directory
- Whether to add `FormService.registerAutomaticAssignmentDecision(...)` to avoid exposing the decision factory helper
- Dead-code cleanup list for FusionRun
- Test migration strategy: characterization-first vs. rewrite

Change name: `deepen-match-step`
