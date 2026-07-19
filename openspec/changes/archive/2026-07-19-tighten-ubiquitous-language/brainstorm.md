<!--
Raw capture of exploration output.

本檔原樣捕捉 exploration session 的產出，不強制結構。
design.md 從本檔萃取並重新整理為結構化設計文件。
-->

# Brainstorm: Tighten Ubiquitous Language

Raw capture of the exploration session that produced this change's design.

## Background

The project already has an OpenSpec `ubiquitous-language` spec and a `docs/concepts/glossary.md`, but both are thin and the codebase speaks several dialects at once. The recent `extract-managed-account-pass-runner` change introduced new terminology (`ManagedAccountPassRunner`, `CandidateRegistry`, Pass 1/Pass 2) while the code still used `analyzeIdentityPhase`/`analyzeDeferredPhase`, `MatchCandidateType.NewUnmatched`, and mixed terms like "peer candidate" vs "deferred candidate." The goal is to produce a single, comprehensive, precise ubiquitous-language spec and align the codebase, documentation, and configuration to it.

## Decision Chain

### Q1: What is the canonical term for a Fusion account seeded from an ISC identity?

**Options:**
- A: "identity-based Fusion account" (current glossary)
- B: "identity-origin Fusion account"

**Decision:** Option B — "identity-origin" is sharper because it describes where the account came from rather than implying its nature.

### Q2: What is the relationship between "matching" and "scoring"?

**Finding:** The product step is Map-Define-Match, but "matching" is also used for the scoring activity, creating ambiguity.

**Decision:**
- **Matching** = the process of determining whether a new Fusion account is potentially part of an existing identity.
- **Scoring** = the similarity-calculation method used by matching.
- The product step remains **Match** (capitalized).

### Q3: What terms should replace "pass" and "phase" for managed-account analysis?

**Finding:** Both words are implementation-shaped, not domain-shaped. "Pass" was used for matching attempts (Pass 1, Pass 2) and "phase" for both pipeline stages and analyzer methods.

**Decision:**
- **Phase** = a major stage of a connector operation pipeline (identity documents phase, fusion accounts phase, managed accounts phase, report phase).
- **Sweep** = a traversal of a set of accounts with a single purpose within a phase.
  - **Correlated account sweep** = resolve already-linked managed accounts and queue uncorrelated ones.
  - **Matching sweeps** = identity scoring sweep, deferred scoring sweep.
- Retire "pass" entirely.

### Q4: What is the canonical term for a managed-account Fusion account before its fate is decided?

**Options:**
- A: "preliminary Fusion account"
- B: "provisional Fusion account"
- C: "draft Fusion account"

**Decision:** Option B — "provisional Fusion account" is the standard term for an account not yet committed.

### Q5: What are the candidate types during matching?

**Finding:** The code uses `MatchCandidateType.NewUnmatched` with public wire value `'new-unmatched'`, but the dry-run payload already maps it to `'deferred'`.

**Decision:**
- Candidate types are **identity** and **deferred**.
- Rename `NewUnmatched` → `Deferred` and `'new-unmatched'` → `'deferred'` everywhere.
- Avoid "peer candidate"; use "deferred candidate."

### Q6: How should operations be named instead of "processing run"?

**Finding:** "Run" and "aggregation" are overloaded. ISC itself overloads "aggregation" (managed source aggregation vs Fusion source aggregation).

**Decision:**
- Refer to the specific operation: **accountList operation**, **dryRun operation**.
- **Aggregation** = the ISC operation that refreshes account data for a source.
- **Managed source aggregation** = aggregation triggered by Fusion on a configured source.
- **Fusion source aggregation** = the ISC aggregation that invokes Fusion's accountList.

### Q7: What should the matching orchestrator class be called?

**Finding:** `ManagedAccountPassRunner` no longer matches the chosen terminology.

**Decision:** `ManagedAccountMatchingRunner` — it runs the matching sweeps.

### Q8: What should the analyzer methods be called?

**Finding:** `analyzeIdentityPhase` and `analyzeDeferredPhase` are mismatched with the new terminology.

**Decision:** `scoreIdentityCandidates` and `scoreDeferredCandidates`.

### Q9: What is the source of truth and enforcement mechanism?

**Decision:**
- OpenSpec `ubiquitous-language/spec.md` is the master.
- `docs/concepts/glossary.md` is the user-friendly mirror.
- Add an instruction to `.agents/AGENTS.md` requiring AI agents to use canonical terms.
- Align the codebase once so the code becomes self-enforcing.
- No automated linter initially.

## Design Trade-offs

| Aspect | Current | Proposed |
|--------|---------|----------|
| Matching traversal | "Pass 1 / Pass 2" | "Identity scoring sweep / deferred scoring sweep" |
| Pre-pass work | "Correlated pre-pass" | "Correlated account sweep" |
| Runner class | `ManagedAccountPassRunner` | `ManagedAccountMatchingRunner` |
| Analyzer methods | `analyzeIdentityPhase` / `analyzeDeferredPhase` | `scoreIdentityCandidates` / `scoreDeferredCandidates` |
| Candidate type | `new-unmatched` | `deferred` |
| Identity-seeded account | "identity-based" | "identity-origin" |
| Transient account | unnamed | "provisional Fusion account" |
| Execution unit | "processing run" | specific operation name (accountList, dryRun, etc.) |

## Scope Boundary

**In scope:**
- Rewrite `openspec/specs/ubiquitous-language/spec.md` as comprehensive master.
- Update `docs/concepts/glossary.md` as user-friendly mirror.
- Add instruction to `.agents/AGENTS.md`.
- Rename code symbols to match canonical terms:
  - `ManagedAccountPassRunner` → `ManagedAccountMatchingRunner`
  - `analyzeIdentityPhase` / `analyzeDeferredPhase` → `scoreIdentityCandidates` / `scoreDeferredCandidates`
  - `MatchCandidateType.NewUnmatched` → `MatchCandidateType.Deferred`
  - `candidateType: 'new-unmatched'` → `'deferred'`
  - `hasNewUnmatchedPeerMatches` → `hasDeferredMatches`
  - Remove dry-run wire mapping `new-unmatched` → `deferred`

**Out of scope:**
- Behavioral changes to matching algorithms, scoring, or configuration.
- New features or capabilities.
- Automated linter or CI enforcement beyond the agent instruction.

## Open Questions

None — all resolved during exploration.
