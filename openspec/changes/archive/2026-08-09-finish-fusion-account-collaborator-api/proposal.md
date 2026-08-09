## Why

The Jul 22 collaborator collapse left a hybrid: real logic lives on `FusionCollections` / `FusionCorrelation` / `FusionLayers`, but callers still use a thick flat `FusionAccount` facade, and living specs still require deleted `FusionAccountState` + rule modules. That dual API and stale contract hurt readability and mislead agents. Finishing the collapse and aligning docs restores one public narrative without changing connector behavior.

## What Changes

**Caller API surface**
- From: Flat mutators/accessors on `FusionAccount` (`addStatus`, `addIdentityLayer`, …) that 1:1-delegate to collaborators
- To: Callers use `fusionAccount.collections.*`, `fusionAccount.correlation.*`, `fusionAccount.layers.*`; flat 1:1 wrappers removed
- Reason: One public API; thinner account class
- Impact: Breaking for in-repo TypeScript callers only (connector host contract unchanged)

**Factory / encapsulation**
- From: Factories mutate collections via `_internal_*` and similar leaks
- To: Proper collaborator APIs for construction/hydration; no cross-type `_internal_*` from `FusionAccount` factories
- Reason: Collaborators own their state
- Impact: Internal refactor; non-breaking externally

**Living specs / glossary**
- From: `fusion-service` requires `FusionAccountState` + rule modules; glossary references `state.name`
- To: Specs describe collaborator architecture; ubiquitous language + glossary define structural terms and fix stale State wording; sync-to-bag requirement matches current (current bag only)
- Reason: Close architectural drift from incomplete Jul 22 archive
- Impact: Spec/docs only for that slice; no product-guide rewrite beyond glossary alignment

## Capabilities

### New Capabilities

<!-- none — reuse existing fusion-service and ubiquitous-language -->

### Modified Capabilities

- `fusion-service`: Replace FusionAccountState / rule-module / thin-facade requirements with collaborator-owned architecture and caller API; align `syncCollectionAttributesToBag` with current-bag-only behavior
- `ubiquitous-language`: Add Fusion account collaborator / structural terms; disambiguate structural `FusionCorrelation` from business correlation; fix Fusion account name (`state.name` → actual property)

## Impact

- **Code**: `src/model/fusionAccount.ts` (thin), `fusionCollections.ts`, `fusionCorrelation.ts`, `fusionLayers.ts`; all in-repo callers under `src/services/`, `src/operations/`, tests
- **Specs/docs**: `openspec/specs/fusion-service/spec.md`, `openspec/specs/ubiquitous-language/spec.md`, `docs/glossary.md`
- **APIs**: No ISC/SDK operation contract change; TypeScript model API breaking inside the connector package
- **Verification**: `npx tsc --noEmit`, `npm run lint`, `npm test`
