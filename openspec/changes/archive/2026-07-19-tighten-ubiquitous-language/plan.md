# Tighten Ubiquitous Language Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a comprehensive ubiquitous-language spec, align docs and AI agent instructions, and rename internal code symbols to match the canonical vocabulary.

**Architecture:** The OpenSpec `ubiquitous-language` spec becomes the master reference; `docs/concepts/glossary.md` is a user-friendly mirror. Code symbols in `src/services/fusionService/` and `src/operations/helpers/` are renamed to remove retired terms (`new-unmatched`, `phase` in matching, `pass`, `identity-based`). `.agents/AGENTS.md` gains an instruction requiring AI agents to consult the spec.

**Tech Stack:** TypeScript, Node.js, Vitest, ESLint, Prettier, MkDocs.

## Global Constraints

- All new domain terms MUST be added to `openspec/specs/ubiquitous-language/spec.md` before being used in code or docs.
- Code identifiers MUST match canonical terms; synonyms and retired terms are forbidden.
- Every requirement in the spec MUST have at least one `#### Scenario:`.
- No connector behavior changes; this is a documentation and naming refactor.
- `npm run lint`, `npm run typecheck`, and `npm test` MUST remain clean.

---

## Task 1: Rewrite the master ubiquitous-language spec

**Files:**
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Test: `npm run lint:markdown`

**Interfaces:**
- Consumes: Design decisions from `openspec/changes/tighten-ubiquitous-language/design.md`.
- Produces: A comprehensive spec with requirements, scenarios, and canonical term tables.

- [ ] **Step 1: Read the current spec and glossary**

  Read: `openspec/specs/ubiquitous-language/spec.md` and `docs/concepts/glossary.md`.

- [ ] **Step 2: Draft the expanded spec**

  Write the full updated spec covering:
  - Purpose and enforcement
  - Account taxonomy
  - Operation, phase, and sweep vocabulary
  - Matching vs scoring
  - Candidates and provisional Fusion account
  - Code/config/docs/agent naming rules

  Ensure every requirement uses SHALL/MUST and every requirement has at least one `#### Scenario:`.

- [ ] **Step 3: Run markdown lint**

  Run: `npm run lint:markdown`
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add openspec/specs/ubiquitous-language/spec.md
  git commit -m "docs(spec): expand ubiquitous-language spec with canonical terms"
  ```

---

## Task 2: Update the user-facing glossary

**Files:**
- Modify: `docs/concepts/glossary.md`
- Test: `npm run lint:markdown`

**Interfaces:**
- Consumes: The updated master spec from Task 1.
- Produces: A curated, user-friendly glossary that mirrors the spec.

- [ ] **Step 1: Rewrite glossary entries**

  Rewrite `docs/concepts/glossary.md` with the canonical terms and definitions, organized by category:
  - Accounts
  - Operation structure
  - Matching
  - Candidates
  - Source types
  - Processing states

- [ ] **Step 2: Run markdown lint**

  Run: `npm run lint:markdown`
  Expected: PASS

- [ ] **Step 3: Commit**

  ```bash
  git add docs/concepts/glossary.md
  git commit -m "docs(glossary): align glossary with ubiquitous-language spec"
  ```

---

## Task 3: Add AI agent instruction to AGENTS.md

**Files:**
- Modify: `.agents/AGENTS.md`

**Interfaces:**
- Consumes: The updated master spec.
- Produces: A new section in `.agents/AGENTS.md` instructing agents to use canonical terms.

- [ ] **Step 1: Add the ubiquitous-language instruction**

  Append a section near the existing rules:

  ```markdown
  ## Ubiquitous Language

  AI agents MUST use the canonical terms defined in `openspec/specs/ubiquitous-language/spec.md` when generating code, documentation, or configuration. Before introducing a new domain term, add it to the spec first.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .agents/AGENTS.md
  git commit -m "docs(agents): add ubiquitous-language instruction for AI agents"
  ```

---

## Task 4: Rename the matching runner and related symbols

**Files:**
- Modify: `src/services/fusionService/managedAccountPassRunner.ts`
- Modify: `src/services/fusionService/__tests__/managedAccountPassRunner.test.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/index.ts`
- Test: `npm run typecheck`, `npm test`

**Interfaces:**
- Consumes: Existing `ManagedAccountPassRunner` class.
- Produces: `ManagedAccountMatchingRunner` class with identical public interface.

- [ ] **Step 1: Rename the runner file**

  ```bash
  git mv src/services/fusionService/managedAccountPassRunner.ts src/services/fusionService/managedAccountMatchingRunner.ts
  ```

- [ ] **Step 2: Rename the class and interfaces in the file**

  In `src/services/fusionService/managedAccountMatchingRunner.ts`:
  - Rename `ManagedAccountPassRunnerState` → `ManagedAccountMatchingRunnerState`
  - Rename `ManagedAccountPassRunner` → `ManagedAccountMatchingRunner`
  - Keep `ManagedAccountPassResult` and `ManagedAccountPassResolution` unless they are renamed separately.

- [ ] **Step 3: Update imports in fusionService.ts**

  Change:
  ```ts
  import { ManagedAccountPassRunner } from './managedAccountPassRunner'
  ```
  to:
  ```ts
  import { ManagedAccountMatchingRunner } from './managedAccountMatchingRunner'
  ```

  Update all references to the class name.

- [ ] **Step 4: Update barrel export**

  In `src/services/fusionService/index.ts`, update the export if it re-exports the runner.

- [ ] **Step 5: Rename test file**

  ```bash
  git mv src/services/fusionService/__tests__/managedAccountPassRunner.test.ts src/services/fusionService/__tests__/managedAccountMatchingRunner.test.ts
  ```

  Update the test file imports and class references.

- [ ] **Step 6: Run typecheck and tests**

  Run: `npm run typecheck`
  Expected: PASS

  Run: `npm test -- src/services/fusionService/__tests__/managedAccountMatchingRunner.test.ts`
  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add src/services/fusionService/managedAccountMatchingRunner.ts
  git add src/services/fusionService/__tests__/managedAccountMatchingRunner.test.ts
  git add src/services/fusionService/fusionService.ts
  git add src/services/fusionService/index.ts
  git commit -m "refactor(fusion): rename ManagedAccountPassRunner to ManagedAccountMatchingRunner"
  ```

---

## Task 5: Rename analyzer methods

**Files:**
- Modify: `src/services/fusionService/managedAccountAnalyzer.ts`
- Modify: `src/services/fusionService/managedAccountMatchingRunner.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/__tests__/fusionService.test.ts`
- Test: `npm run typecheck`, `npm test`

**Interfaces:**
- Consumes: Existing `analyzeIdentityPhase` and `analyzeDeferredPhase` methods.
- Produces: `scoreIdentityCandidates` and `scoreDeferredCandidates` methods.

- [ ] **Step 1: Rename methods in ManagedAccountAnalyzer**

  In `src/services/fusionService/managedAccountAnalyzer.ts`:
  - Rename `analyzeIdentityPhase` → `scoreIdentityCandidates`
  - Rename `analyzeDeferredPhase` → `scoreDeferredCandidates`

- [ ] **Step 2: Update runner calls**

  In `src/services/fusionService/managedAccountMatchingRunner.ts`:
  - Replace `this.state.managedAccountAnalyzer.analyzeIdentityPhase(account)` with `this.state.managedAccountAnalyzer.scoreIdentityCandidates(account)`
  - Replace `this.state.managedAccountAnalyzer.analyzeDeferredPhase(pending.analysis)` with `this.state.managedAccountAnalyzer.scoreDeferredCandidates(pending.analysis)`

- [ ] **Step 3: Update any other callers**

  Search for `analyzeIdentityPhase` and `analyzeDeferredPhase` in `src/` and update all references.

- [ ] **Step 4: Run typecheck and tests**

  Run: `npm run typecheck`
  Expected: PASS

  Run: `npm test -- src/services/fusionService/__tests__/`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/services/fusionService/managedAccountAnalyzer.ts
  git add src/services/fusionService/managedAccountMatchingRunner.ts
  git add src/services/fusionService/fusionService.ts
  git add src/services/fusionService/__tests__/fusionService.test.ts
  git commit -m "refactor(fusion): rename analyzer methods to scoreIdentityCandidates and scoreDeferredCandidates"
  ```

---

## Task 6: Rename candidate type from new-unmatched to deferred

**Files:**
- Modify: `src/services/scoringService/types.ts`
- Modify: `src/services/scoringService/scoringService.ts`
- Modify: `src/services/fusionService/types.ts`
- Modify: `src/services/fusionService/helpers.ts`
- Modify: `src/services/fusionService/managedAccountAnalyzer.ts`
- Modify: `src/services/fusionService/managedAccountAnalysisRecorder.ts`
- Modify: `src/services/fusionService/managedAccountMatchingRunner.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/operations/helpers/buildDryRunPayload.ts`
- Modify: related test files
- Test: `npm run typecheck`, `npm test`

**Interfaces:**
- Consumes: `MatchCandidateType.NewUnmatched` and `'new-unmatched'` strings.
- Produces: `MatchCandidateType.Deferred` and `'deferred'` strings.

- [ ] **Step 1: Rename the enum member**

  In `src/services/scoringService/types.ts`:
  ```ts
  export enum MatchCandidateType {
      Identity = 'identity',
      Deferred = 'deferred',
  }
  ```

- [ ] **Step 2: Update all references in source files**

  Replace `MatchCandidateType.NewUnmatched` with `MatchCandidateType.Deferred` and `'new-unmatched'` with `'deferred'` in:
  - `src/services/scoringService/scoringService.ts`
  - `src/services/fusionService/types.ts`
  - `src/services/fusionService/helpers.ts`
  - `src/services/fusionService/managedAccountAnalyzer.ts`
  - `src/services/fusionService/managedAccountAnalysisRecorder.ts`
  - `src/services/fusionService/managedAccountMatchingRunner.ts`
  - `src/services/fusionService/fusionService.ts`

- [ ] **Step 3: Rename helper function**

  In `src/services/fusionService/helpers.ts`:
  - Rename `hasNewUnmatchedPeerMatches` → `hasDeferredMatches`
  - Update the implementation to check `candidateType === 'deferred'`

- [ ] **Step 4: Remove dry-run wire translation**

  In `src/operations/helpers/buildDryRunPayload.ts`:
  - Remove the `wireCandidateType` function.
  - Use `candidateType` directly where it was previously wrapped.

- [ ] **Step 5: Update tests**

  Replace all `'new-unmatched'` strings and `NewUnmatched` references in test files under `src/services/fusionService/__tests__/`, `src/services/scoringService/__tests__/`, `src/operations/__tests__/`, `src/operations/helpers/__tests__/`, and `src/services/formService/__tests__/`.

- [ ] **Step 6: Run typecheck and tests**

  Run: `npm run typecheck`
  Expected: PASS

  Run: `npm test`
  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add src/services/scoringService/types.ts
  git add src/services/scoringService/scoringService.ts
  git add src/services/fusionService/types.ts
  git add src/services/fusionService/helpers.ts
  git add src/services/fusionService/managedAccountAnalyzer.ts
  git add src/services/fusionService/managedAccountAnalysisRecorder.ts
  git add src/services/fusionService/managedAccountMatchingRunner.ts
  git add src/services/fusionService/fusionService.ts
  git add src/operations/helpers/buildDryRunPayload.ts
  git add src/services/fusionService/__tests__/
  git add src/services/scoringService/__tests__/
  git add src/operations/__tests__/
  git add src/operations/helpers/__tests__/
  git add src/services/formService/__tests__/
  git commit -m "refactor(fusion): rename candidate type new-unmatched to deferred"
  ```

---

## Task 7: Rename correlated account pre-pass

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/__tests__/fusionService.test.ts`
- Test: `npm run typecheck`, `npm test`

**Interfaces:**
- Consumes: `runCorrelatedManagedAccountPrePass` method.
- Produces: `runCorrelatedAccountSweep` method.

- [ ] **Step 1: Rename the method**

  In `src/services/fusionService/fusionService.ts`:
  - Rename `runCorrelatedManagedAccountPrePass` → `runCorrelatedAccountSweep`
  - Update any comments or log messages that mention "pre-pass" to use "correlated account sweep".

- [ ] **Step 2: Update tests**

  Update test descriptions and helper references in `src/services/fusionService/__tests__/fusionService.test.ts`.

- [ ] **Step 3: Run typecheck and tests**

  Run: `npm run typecheck`
  Expected: PASS

  Run: `npm test -- src/services/fusionService/__tests__/fusionService.test.ts`
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add src/services/fusionService/fusionService.ts
  git add src/services/fusionService/__tests__/fusionService.test.ts
  git commit -m "refactor(fusion): rename correlated pre-pass to correlated account sweep"
  ```

---

## Task 8: Update comments and log messages

**Files:**
- Modify: `src/services/fusionService/*.ts`
- Modify: `src/services/scoringService/*.ts`
- Modify: `src/operations/helpers/*.ts`
- Test: `npm run lint`

**Interfaces:**
- Consumes: Canonical terms from the spec.
- Produces: Comments and log messages that use canonical terms.

- [ ] **Step 1: Search for retired terms**

  Search for and update:
  - `identity-based` → `identity-origin`
  - `new-unmatched` → `deferred`
  - `peer candidate` → `deferred candidate`
  - `pre-pass` → `correlated account sweep` (where it refers to the correlated work)
  - `Pass 1` / `Pass 2` → `identity scoring sweep` / `deferred scoring sweep`
  - `processing run` → specific operation name

- [ ] **Step 2: Run lint**

  Run: `npm run lint`
  Expected: PASS

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "docs(code): update comments and log messages to use canonical terms"
  ```

---

## Task 9: Final verification

**Files:**
- All modified files

**Interfaces:**
- Consumes: All changes from previous tasks.
- Produces: A clean lint/test state and a retired-term-free codebase.

- [ ] **Step 1: Run full verification**

  Run: `npm run lint`
  Expected: PASS

  Run: `npm run typecheck`
  Expected: PASS

  Run: `npm test`
  Expected: PASS

  Run: `npm run lint:markdown`
  Expected: PASS

- [ ] **Step 2: Search for retired terms**

  Run:
  ```bash
  grep -R "new-unmatched" src/ || echo "none"
  grep -R "analyzeIdentityPhase\|analyzeDeferredPhase" src/ || echo "none"
  grep -R "ManagedAccountPassRunner" src/ || echo "none"
  grep -R "hasNewUnmatchedPeerMatches" src/ || echo "none"
  grep -R "identity-based" src/ docs/ || echo "none"
  grep -R "processing run" src/ docs/ || echo "none"
  ```
  Expected: All return "none" except in legitimate historical comments or archived files.

- [ ] **Step 3: Read spec and glossary for consistency**

  Read: `openspec/specs/ubiquitous-language/spec.md` and `docs/concepts/glossary.md`.
  Verify they are consistent and complete.

- [ ] **Step 4: Commit or tag final state**

  ```bash
  git add -A
  git commit -m "chore: finalize ubiquitous-language alignment"
  ```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Canonical terms in glossary | Task 1, Task 2 |
| Code uses canonical terms | Task 4, Task 5, Task 6, Task 7 |
| Configuration uses canonical terms | Task 8 (connector-spec.json help text review) |
| Documentation uses canonical terms | Task 2, Task 8 |
| AI agents use canonical terms | Task 3 |
| Account taxonomy | Task 1, Task 2, Task 8 |
| Provisional Fusion account | Task 1, Task 2, Task 8 |
| Operation and phase terms | Task 1, Task 2, Task 7, Task 8 |
| Matching vs scoring | Task 1, Task 2, Task 5, Task 8 |
| Candidate types | Task 1, Task 2, Task 6 |
| Symbol names match terms | Task 4, Task 5, Task 6, Task 7 |

---

## Execution Handoff

**Plan complete and saved to `openspec/changes/tighten-ubiquitous-language/plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`.

Run `/opsx-apply` to start implementing.
