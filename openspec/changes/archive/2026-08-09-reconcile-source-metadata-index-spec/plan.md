# Reconcile Source Metadata Index Spec — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Align living OpenSpec requirements with the shipped dual-index source metadata pattern (no code changes).

**Architecture:** Spec-only merge of fusion-run and source-service deltas; validate with `openspec validate --all --json` and ripgrep audit.

**Tech Stack:** OpenSpec delta specs, markdown living specs under `openspec/specs/`

**Canonical test command:** `openspec validate --all --json`

---

## Task 1: Merge fusion-run delta

- [ ] **Step 1:** Open `openspec/changes/reconcile-source-metadata-index-spec/specs/fusion-run/spec.md`
- [ ] **Step 2:** Apply MODIFIED requirement **FusionRun is the only owner of managed source inventory maps** to `openspec/specs/fusion-run/spec.md` (full replacement per delta)
- [ ] **Step 3:** Apply ADDED requirement **Source metadata tiers are documented for implementers** to living spec
- [ ] **Step 4:** Run `openspec validate --all --json`

## Task 2: Merge source-service delta

- [ ] **Step 1:** Open `openspec/changes/reconcile-source-metadata-index-spec/specs/source-service/spec.md`
- [ ] **Step 2:** Apply ADDED requirement **SourceService maintains discovery-session source metadata indexes**
- [ ] **Step 3:** Apply MODIFIED requirement **SourceService writes account data to FusionRun** (full replacement)
- [ ] **Step 4:** Run `openspec validate --all --json`

## Task 3: Audit and close

- [ ] **Step 1:** Ripgrep `openspec/specs/` for normative text forbidding `sourcesById` without the id-index exception
- [ ] **Step 2:** Mark all tasks.md checkboxes complete
- [ ] **Step 3:** Run `openspec validate --all --json` — all valid
- [ ] **Step 4:** Add changelog entry (spec-only reconciliation)

## Task 4: Documentation / Changelog (mandatory closing)

- [ ] **Step 1:** Mark documentation tasks N/A with reason in tasks.md
- [ ] **Step 2:** Changelog entry confirms no connector behavior change
