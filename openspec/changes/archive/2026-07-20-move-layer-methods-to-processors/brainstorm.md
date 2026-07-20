# Brainstorm: Move Layer Methods to Processors

## Problem

`FusionAccountBase` has 4 layer methods that are thin pass-throughs to free functions in `layerRules.ts`. Each just does `freeFunc(this.state, ...args)`. The methods exist only because `this.state` is `protected` — callers can't reach it directly.

Three of the four callers (`DecisionProcessor`, `IdentityProcessor`, `FusionService`) all pass identical service-layer context through these thin methods. The context (WorkQueue, managedAccountsAllById, pruning config, blend callbacks) lives in the processors, not in the model.

```
Service Layer                          Model Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DecisionProcessor                    FusionAccountBase
  │                                    │
  │ has: run, sources, deps            │
  │                                    │
  ├─► addManagedAccountLayer(          │
  │     this.run,     ◄──────────── context passed through ──
  │     sources.all,                                      │
  │     { prune, onBlend })                               │
  │                                                       ▼
  │                                    addManagedAccountLayer(state, ...args)
  │                                                       │
  │                                    ┌──────────────────┘
  │                                    ▼
  │                                    layerRules.ts (free function)
  │                                      addManagedAccountLayer(state, ...)
```

## Analysis of the 4 Layer Methods

| Method | Inversion Severity | Reason |
|--------|-------------------|--------|
| `addManagedAccountLayer` | HIGH | Needs WorkQueue, Map, Options, callbacks — all from service layer |
| `addIdentityLayer` | LOW | Takes IdentityDocument — model already references identity concepts |
| `addFusionDecisionLayer` | LOW | Takes FusionDecision — model already references decision concepts |
| `addFusionMatch` | NONE | Trivial push to array — called from MatchingService, different pattern |

`addManagedAccountLayer` is the outlier. It mutates the shared `WorkQueue` (owned by FusionRun), not just the FusionAccount's own state.

## Options Considered

### A: Move to processors (chosen)
- Expose `state` on `FusionAccountBase` (public readonly)
- Delete the 4 thin wrapper methods
- Processors import from `layerRules.ts` and call free functions with `fusionAccount.state`
- `addFusionMatch` stays via MatchingService calling the free function directly

### B: Fix the abstraction, keep location
- Split queue mutation out of `addManagedAccountLayer`
- Let caller claim accounts and pass `Iterable<Account>`
- Method signature shrinks but stays on model

### C: Extract a LayerService
- New service with context, operates on FusionAccountStates
- Over-engineering for 4 methods

## Relationship to `encapsulate-fusionrun-state`

The active change `encapsulate-fusionrun-state` wraps raw Map access on FusionRun. This change moves layer orchestration to the processors that already own the context. Both push logic toward the service layer, but at different levels. Complementary, not conflicting.
