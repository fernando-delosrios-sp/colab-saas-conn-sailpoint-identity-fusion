## Why

The project already has an OpenSpec ubiquitous-language spec and a docs glossary, but both are thin and the codebase speaks several dialects. The recent ManagedAccountPassRunner change introduced Pass 1/Pass 2 while the analyzer still exposed `analyzeIdentityPhase`, the scoring service uses `MatchCandidateType.NewUnmatched`, and the dry-run wire already maps that to `deferred`. Without a single canonical vocabulary, docs, configuration help text, and code identifiers drift apart, making the system harder to reason about and maintain. Tightening the ubiquitous language now prevents synonyms from calcifying across the project.

## What Changes

**Rewrite ubiquitous-language spec**
- From: A brief OpenSpec spec with a short term table and a user-friendly docs glossary.
- To: A comprehensive master spec that defines every domain term, with `docs/concepts/glossary.md` as a curated mirror.
- Reason: Establishes one source of truth for terminology across code, config, docs, and AI agents.
- Impact: Non-breaking; documentation and spec artifact changes only.

**Align matching terminology**
- From: `ManagedAccountPassRunner`, `analyzeIdentityPhase`/`analyzeDeferredPhase`, `new-unmatched` candidate type, "peer candidate" in places.
- To: `ManagedAccountMatchingRunner`, `scoreIdentityCandidates`/`scoreDeferredCandidates`, `deferred` candidate type, "deferred candidate."
- Reason: "Pass/phase" were implementation-shaped and overloaded; "deferred" is already the public dry-run wire value.
- Impact: Non-breaking internal refactor; no connector behavior changes.

**Introduce precise account terms**
- From: "identity-based Fusion account" and implicit unnamed transient accounts.
- To: "identity-origin Fusion account" and "provisional Fusion account."
- Reason: Origin describes source, not nature; provisional captures the pre-decision state.
- Impact: Non-breaking; naming and glossary updates.

**Add AI agent instruction**
- From: `.agents/AGENTS.md` has no terminology instruction.
- To: `.agents/AGENTS.md` instructs AI agents to use canonical terms from the ubiquitous-language spec.
- Reason: Makes the spec enforceable for AI-generated changes.
- Impact: Non-breaking.

## Capabilities

### New Capabilities
None. This change tightens existing vocabulary and aligns existing code; it does not introduce new runtime capabilities.

### Modified Capabilities
- `ubiquitous-language`: Expand requirements to cover account taxonomy, pipeline phases, matching sweeps, candidates, correlation/assignment, and operation naming. Add enforcement via AI agent instruction.

## Impact

- Affected files: `openspec/specs/ubiquitous-language/spec.md`, `docs/concepts/glossary.md`, `.agents/AGENTS.md`, plus TypeScript identifiers in `src/services/fusionService/` and `src/operations/helpers/`.
- No API, configuration schema, or connector behavior changes.
- Tests must remain green after symbol renames.
