# Brainstorm: Finish FusionAccount collaborator API

Raw capture from `/opsx-explore` on FusionAccountState / rules facade drift, followed by `/opsx-propose` with path A + documentation.

## Background

After `2026-07-17-split-fusion-account-data-rules-seam`, `FusionAccount` became a thin facade over `FusionAccountState` + free-function rule modules. That design was intentionally reversed in `2026-07-22-collapse-fusionaccount-facade`: State and rule modules deleted; behavior-rich collaborators introduced (`FusionCollections`, `FusionCorrelation`, `FusionLayers`).

**Canonical specs were never updated** after the collapse. `openspec/specs/fusion-service/spec.md` still requires `FusionAccountState` and rule modules. Ubiquitous language / glossary still reference `state.name`. Spec-drift audit ranked this high severity (architectural contract gap).

**Code today (hybrid):**
- Collaborators exist and hold real logic
- `FusionAccount` remains ~875 lines with a flat public API used by nearly all callers
- Factories reach into collaborators via `_internal_*` leaks
- Collapse plan target (~150-line account + caller migration to `collections.*` / `layers.*`) never finished

Recording/replay uses `FusionRun`, not `FusionAccountState` — easy to conflate; they are different scopes (run vs account).

## Goal

Code cleanliness and readability: one public narrative for the account model, private ownership inside collaborators, specs and ubiquitous language aligned with reality.

## Decision chain

### Q1: Revive FusionAccountState + rules?

**Decision: No.** Jul 17 already proved the failure modes: file fragmentation for one behavior, anemic public state (no encapsulation), shallow 1:1 facade. State optimizes for data inventory; goal is readable behavior.

### Q2: Path A vs B vs C?

| Path | Meaning |
|------|---------|
| A. Finish collapse | Thin `FusionAccount`; migrate callers to collaborator API; kill `_internal_*` |
| B. Deep module | Keep flat public API; hide collaborators as implementation |
| C. Restore State+rules | Rejected for cleanliness goal |

**Decision: Path A**, with documentation catch-up so living specs describe collaborators (not State/rules).

### Q3: Is collaborator vocabulary “clearer domain language”?

**Decision: No — correct the framing.** Business vocabulary (statuses, actions, accounts, correlation-as-ISC-linking) is already documented in ubiquitous language. `collections` / `correlation` / `layers` are an **implementation taxonomy**, currently undocumented, with mild overload (`correlation` helper vs business correlation; `layers` not in glossary).

Path A buys structural clarity (one API surface, thinner facade), not automatic domain clarity. Documentation work must:
- Define the three collaborators as **Fusion account structure** terms (implementation architecture), distinct from business correlation
- Remove stale `FusionAccountState` / `state.name` / rule-module requirements
- Keep business terms as the primary UL; structural terms as secondary “how the model is organized”

### Q4: Rename collaborators as part of this change?

**Decision: Out of scope for rename.** Keep `FusionCollections` / `FusionCorrelation` / `FusionLayers` names already in code. Document them clearly rather than renaming in the same change (rename would expand blast radius without changing behavior). Follow-up rename possible after docs stabilize.

### Q5: Sync bag (`current` vs `previous`)?

Stale State-era requirement said `syncCollectionAttributesToBag` writes both `attributeBag.current` and `previous`. Code writes via `collections.syncToBag` into the current bag only. **Decision: Spec aligns to current behavior** (current bag only) unless a concrete bug is found — no behavior change for sync in this change.

### Q6: Flat convenience wrappers after migration?

**Decision: Delete flat mutators/accessors that only delegate 1:1.** Keep on `FusionAccount`: identity/basic info, attribute bag accessors needed for Map/Define, factories, `configure`, `toISCAccount`, and thin orchestration that spans collaborators when unavoidable. Callers use `account.collections.*`, `account.correlation.*`, `account.layers.*`.

### Q7: Documentation surfaces

**In scope:**
- `openspec/specs/fusion-service/spec.md` — replace State/rules requirements with collaborator architecture
- `openspec/specs/ubiquitous-language/spec.md` + `docs/glossary.md` — add structural terms; fix `state.name`
- Spec-drift report item considered resolved after archive (implementation note)

**Out of scope:** User-facing product guides that don’t mention internal model structure.

## Approaches considered (reaffirmed)

1. **Spec-only catch-up (document hybrid)** — Low risk, leaves dual API and `_internal_*`. Rejected: doesn’t meet cleanliness goal.
2. **Path A finish collapse + docs** — Recommended. Higher churn; single coherent end state.
3. **Path B hide collaborators** — Lower churn; preserves dual mental model inside the model package. Rejected by user choice of A.

## Approved design shape (for downstream artifacts)

```
FusionAccount (thin)
├── identity / key / name / email / attributeBag (owned here)
├── collections: FusionCollections   // statuses, actions, reviews, accounts, history, matches…
├── correlation: FusionCorrelation   // promises, markCorrelated, updateStatus
└── layers: FusionLayers             // identity / managed / decision enrichment + flags
```

- Callers migrate to collaborator API
- Collaborator constructors get proper APIs so factories don’t need `_internal_*`
- Specs + UL/glossary updated; State/rules deleted from living contract
- Behavior unchanged (refactor + docs)

## Success criteria

- `FusionAccount.ts` substantially thinner (order-of-magnitude toward ~150–300 lines of non-delegation surface)
- No production `_internal_*` access from outside collaborator owning type (except documented package-private helpers if still required between collaborators)
- Call sites use collaborator vocabulary
- Canonical fusion-service + ubiquitous-language + glossary match code
- `tsc`, eslint, vitest green; no intentional behavior change
