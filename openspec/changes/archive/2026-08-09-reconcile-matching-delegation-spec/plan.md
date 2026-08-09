# Reconcile Matching Delegation Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align living OpenSpec requirements with the shipped three-layer matching architecture (FusionService pipeline → MatchOutcomeDispatcher → MatchingService scoring) without changing production code.

**Architecture:** Spec-only delta merge. Remove stale `fusion-service` MatchingService delegation requirements. Clarify `MatchOutcomeDispatcher` as sweep orchestrator. Retire `ManagedAccountMatchingRunner` from ubiquitous language. Align `configureScoring({ captureBreakdown })` wording.

**Tech Stack:** OpenSpec (`openspec validate`), Markdown living specs under `openspec/specs/`.

**Canonical test commands:** `openspec validate --all --json` (primary gate). Optional: `rg 'ManagedAccountMatchingRunner|processUncorrelatedManagedAccounts' openspec/specs` (audit). No `npm test` required — no code changes.

**Change artifacts:** `openspec/changes/reconcile-matching-delegation-spec/{brainstorm,proposal,design,tasks,specs/**}.md`

## Global Constraints

- Spec/docs only — do not modify `src/` unless audit finds stale JSDoc referencing `ManagedAccountMatchingRunner`
- Preserve existing match behavior contracts in `match-outcome-dispatch` spec (outcome routing unchanged)
- Use Gherkin scenarios with exactly `#### Scenario:` headers in merged living specs
- Run `openspec validate --all --json` after each spec file merge

---

### Task 1: Merge fusion-service delta

**Files:**
- Modify: `openspec/specs/fusion-service/spec.md`
- Source: `openspec/changes/reconcile-matching-delegation-spec/specs/fusion-service/spec.md`

- [ ] **Step 1:** Remove requirement "FusionService delegates matching to MatchingService" and its scenarios from living spec
- [ ] **Step 2:** Add new requirements: "FusionService owns managed-account pipeline phases" and "FusionService delegates match outcome dispatch to MatchOutcomeDispatcher" with all scenarios from delta
- [ ] **Step 3:** Validate
  ```bash
  openspec validate fusion-service --json
  ```
- [ ] **Step 4:** Ripgrep audit
  ```bash
  rg 'MatchingService\.processUncorrelatedManagedAccounts|ManagedAccountMatchingRunner' openspec/specs/fusion-service/spec.md
  ```
  Expect no matches.

---

### Task 2: Merge matching-service delta

**Files:**
- Modify: `openspec/specs/matching-service/spec.md`
- Source: `openspec/changes/reconcile-matching-delegation-spec/specs/matching-service/spec.md`

- [ ] **Step 1:** Update **Purpose** paragraph — remove ManagedAccountMatchingRunner; describe scoring + MatchOutcomeDispatcher split
- [ ] **Step 2:** Remove "MatchingService owns the two-sweep matching runner" requirement
- [ ] **Step 3:** Replace CandidateRegistry requirement with MODIFIED delta content (FusionRun pool)
- [ ] **Step 4:** Replace captureBreakdown requirement — `configureScoring({ captureBreakdown })` not `setCaptureBreakdown`
- [ ] **Step 5:** Add "MatchingService scope is scoring and trigram blocking" requirement
- [ ] **Step 6:** Validate
  ```bash
  openspec validate matching-service --json
  ```

---

### Task 3: Merge match-outcome-dispatch delta

**Files:**
- Modify: `openspec/specs/matching-service/match-outcome-dispatch/spec.md`
- Source: `openspec/changes/reconcile-matching-delegation-spec/specs/matching-service/match-outcome-dispatch/spec.md`

- [ ] **Step 1:** Replace "FusionService invokes one verb" scenario block with MODIFIED delta (uncorrelated batch + correlated per-account scenarios)
- [ ] **Step 2:** Add "MatchOutcomeDispatcher owns the two-sweep match lifecycle" requirement from delta
- [ ] **Step 3:** Validate
  ```bash
  openspec validate matching-service/match-outcome-dispatch --json
  ```

---

### Task 4: Merge ubiquitous-language delta

**Files:**
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Source: `openspec/changes/reconcile-matching-delegation-spec/specs/ubiquitous-language/spec.md`

- [ ] **Step 1:** Update type-naming scenario — `MatchOutcomeDispatcher` not `ManagedAccountMatchingRunner`
- [ ] **Step 2:** Add "Match sweep orchestration term is MatchOutcomeDispatcher" requirement
- [ ] **Step 3:** Update Retired Terms: add `ManagedAccountMatchingRunner` → use `MatchOutcomeDispatcher`; update `ManagedAccountPassRunner` mapping
- [ ] **Step 4:** Validate
  ```bash
  openspec validate ubiquitous-language --json
  ```

---

### Task 5: Full validation and optional src audit

- [ ] **Step 1:** Run full validation
  ```bash
  openspec validate --all --json
  ```
- [ ] **Step 2:** Living-spec ripgrep audit
  ```bash
  rg 'ManagedAccountMatchingRunner|MatchingService\.processUncorrelatedManagedAccounts|setCaptureBreakdown' openspec/specs
  ```
  Expect no normative stale references (retired-terms table may mention retired names in migration context).
- [ ] **Step 3:** Optional src JSDoc audit
  ```bash
  rg 'ManagedAccountMatchingRunner' src
  ```
  If matches found, update to `MatchOutcomeDispatcher` in comments only.

---

### Task 6: Changelog and scratch report (optional)

- [ ] **Step 1:** Add changelog entry: spec reconciliation for matching delegation; no behavior change
- [ ] **Step 2:** Optionally mark matching delegation rows resolved in `.scratch/spec-drift-report.md`

---

## Scenario → verification map (spec-only)

| Scenario | Verification |
|---|---|
| Process phase runs pipeline phases in order | Living spec text + accountListPhases code unchanged |
| Uncorrelated sweep delegates to MatchOutcomeDispatcher | `fusionService.ts` `runUncorrelatedManagedAccountSweep` |
| Correlated sweep per-account runMatchSweep | `runCorrelatedAccountSweep` → `processManagedAccount` |
| MatchingService has no processUncorrelatedManagedAccounts | `rg` on `matchingService.ts` |
| configureScoring captureBreakdown | `fusionService.ts` init + `matchingService.ts` |
| Retire ManagedAccountMatchingRunner | UL retired terms + living spec ripgrep |
