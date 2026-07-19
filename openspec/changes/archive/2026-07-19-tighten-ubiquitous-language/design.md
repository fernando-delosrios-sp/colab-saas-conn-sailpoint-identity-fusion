## Context

The project is a SailPoint Identity Security Cloud connector written in TypeScript. It maintains an OpenSpec `ubiquitous-language` spec and a `docs/concepts/glossary.md`, but both are currently lightweight. The codebase uses overlapping and sometimes contradictory terms:

- `ManagedAccountPassRunner` runs "Pass 1" and "Pass 2" while the analyzer exposes `analyzeIdentityPhase` and `analyzeDeferredPhase`.
- The scoring service uses `MatchCandidateType.NewUnmatched` with string value `'new-unmatched'`, while the dry-run wire already maps that value to `'deferred'`.
- Docs and code mix "identity-based" and "identity-origin," "peer candidate" and "deferred candidate," and "processing run" with specific operation names.

The recent `extract-managed-account-pass-runner` change made the terminology problem visible by introducing new structures without a canonical vocabulary. This change creates that vocabulary and aligns the artifacts that depend on it.

## Goals / Non-Goals

**Goals:**
- Establish a single, comprehensive, precise ubiquitous-language spec as the source of truth.
- Rewrite `docs/concepts/glossary.md` as a user-friendly mirror of the spec.
- Add an instruction to `.agents/AGENTS.md` so AI agents use canonical terms.
- Rename internal code symbols to match the canonical vocabulary.
- Remove the dry-run wire translation that maps `new-unmatched` to `deferred`.

**Non-Goals:**
- Change matching algorithms, scoring behavior, or configuration schema.
- Introduce new runtime capabilities.
- Build an automated linter or CI gate for terminology.
- Update marketing or external documentation outside this repository.

## Decisions

### D1: Source of truth

- **Choice:** `openspec/specs/ubiquitous-language/spec.md` is the master; `docs/concepts/glossary.md` is a user-friendly mirror.
- **Rationale:** OpenSpec specs are versioned with changes and can be enforced by planning workflows; docs are for human readers.
- **Alternatives considered:** Make the docs page the master (rejected — specs are closer to code and review gates).

### D2: Matching vs scoring

- **Choice:**
  - **Matching** = the process of determining whether a new Fusion account is potentially part of an existing identity.
  - **Scoring** = the similarity-calculation method used by matching.
  - The product step remains **Match** (capitalized, like Map and Define).
- **Rationale:** Separates the business process from the implementation technique.
- **Alternatives considered:** Rename the step to Compare or Resolve (rejected — Map-Define-Match is established product language).

### D3: Phase vs sweep

- **Choice:**
  - **Phase** = a major stage of a connector operation pipeline (identity documents phase, fusion accounts phase, managed accounts phase, report phase).
  - **Sweep** = a traversal of a set of accounts with a single purpose within a phase.
- **Rationale:** "Pass" and "phase" were both overloaded and implementation-oriented; "sweep" is a precise, distinct traversal term.
- **Alternatives considered:** Round (rejected — slightly less common in data-matching contexts), comparison (rejected — too narrow; the sweep also registers candidates and classifies results).

### D4: Account taxonomy

- **Choice:**
  - **ISC account** = any account object from ISC.
  - **Managed source account** = an ISC account from a configured Fusion source.
  - **Fusion account** = the consolidated account produced by Map and Define.
  - **Fusion identity** = a Fusion account correlated to an ISC identity.
  - **Identity-origin Fusion account** = a Fusion account seeded from an ISC identity.
  - **Provisional Fusion account** = a Fusion account created from a managed source account before its match fate is decided.
- **Rationale:** "Origin" describes source, not nature; "provisional" captures the pre-decision state.
- **Alternatives considered:** "Identity-based" (rejected — implies the account's nature rather than its origin), "preliminary" (rejected — "provisional" is more standard in merge/identity contexts).

### D5: Candidate types

- **Choice:** Candidate types are **identity** and **deferred**. Rename `MatchCandidateType.NewUnmatched` to `Deferred` and remove the dry-run wire translation.
- **Rationale:** The dry-run output already uses `deferred`; internal and external vocabulary should match.
- **Alternatives considered:** Keep `new-unmatched` internally and `deferred` externally (rejected — perpetuates a dual vocabulary).

### D6: Operation naming

- **Choice:** Replace generic "processing run" with the specific operation name (`accountList operation`, `dryRun operation`). Use **aggregation** for the ISC source-refresh operation, qualified as **managed source aggregation** or **Fusion source aggregation** when needed.
- **Rationale:** ISC itself overloads "aggregation"; being explicit about the operation and source removes ambiguity.
- **Alternatives considered:** Define "aggregation run" for the Fusion side (rejected — still overloaded with ISC terminology).

### D7: Code symbol renames

- **Choice:**
  - `ManagedAccountPassRunner` → `ManagedAccountMatchingRunner`
  - `analyzeIdentityPhase` → `scoreIdentityCandidates`
  - `analyzeDeferredPhase` → `scoreDeferredCandidates`
  - `hasNewUnmatchedPeerMatches` → `hasDeferredMatches`
  - `MatchCandidateType.NewUnmatched` → `MatchCandidateType.Deferred`
  - `candidateType: 'new-unmatched'` → `candidateType: 'deferred'`
- **Rationale:** The new names directly reflect the canonical terms.
- **Alternatives considered:** Rename runner to `ManagedAccountScoringRunner` (rejected — it does more than scoring; it orchestrates candidate registration and result classification).

### D8: Enforcement

- **Choice:** Add an instruction to `.agents/AGENTS.md` and align the codebase once. No automated linter.
- **Rationale:** AI-generated changes are the highest-leverage place to enforce vocabulary; a one-time alignment makes the code self-documenting. A linter is high-effort and noisy for natural language.
- **Alternatives considered:** Terminology lint script (rejected — context-dependent false positives), PR checklist only (rejected — does not help AI agents).

## Risks / Trade-offs

- **[Risk] Renaming widely used symbols breaks tests or other imports.** → Mitigation: Use TypeScript-aware renames and run the full test suite after each rename; this is a non-breaking internal refactor.
- **[Risk] Docs or config still use retired terms after the rename.** → Mitigation: Include a documentation sweep in the task list and verify with `npm run lint:markdown`.
- **[Trade-off] No automated linter means human/AI discipline required.** → Accepted: the spec and agent instruction are the enforcement mechanisms for now.
- **[Trade-off] Comprehensive spec takes more space than a glossary.** → Accepted: the spec is the master reference; the glossary is a curated, user-friendly subset.

## Migration Plan

N/A — this is a documentation, spec, and internal naming refactor. No deployment, database, or configuration changes. Rollback is a revert of the affected files.

## Open Questions

None — all resolved during exploration.
