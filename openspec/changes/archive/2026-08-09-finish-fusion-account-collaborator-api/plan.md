# Finish FusionAccount Collaborator API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Jul 22 collaborator collapse—callers use `collections` / `correlation` / `layers`, thin `FusionAccount`, kill factory `_internal_*` leaks—and align living specs/glossary (no `FusionAccountState`).

**Architecture:** `FusionAccount` remains the aggregate root (identity + attribute bag + factories). Behavior-rich collaborators own their private state. Flat 1:1 facade methods are removed after callers migrate. Specs replace State/rules requirements with collaborator contracts.

**Tech Stack:** TypeScript (strict), Vitest, OpenSpec living specs under `openspec/specs/`, MkDocs glossary at `docs/glossary.md`.

**Canonical test commands:** `npx tsc --noEmit`, `npm run lint`, `npm test` (or targeted `npx vitest run <path>` during batches). Do not pipe test output to `tail`.

**Change artifacts:** `openspec/changes/finish-fusion-account-collaborator-api/{brainstorm,proposal,design,tasks,specs/**}.md`

## Global Constraints

- Behavior-preserving refactor — no intentional ISC wire/behavior change
- Do not revive `FusionAccountState` or `fusionAccountRules/`
- Do not rename collaborator types in this change
- Write plan/apply outputs only under this change dir / `src` / living specs / glossary / changelog — not `docs/superpowers/plans/`
- Use ubiquitous language; disambiguate business **correlation** vs **FusionCorrelation**

## File map

| File | Responsibility |
|------|----------------|
| `src/model/fusionCollections.ts` | Hydrate APIs; collection ownership; `syncToBag` |
| `src/model/fusionLayers.ts` | Layer flags/origin setters; enrichment methods |
| `src/model/fusionCorrelation.ts` | Promises / markCorrelated (minimal changes) |
| `src/model/fusionAccount.ts` | Factories → hydrate APIs; then thin public surface |
| Callers under `src/services/**`, `src/operations/**` | Collaborator API |
| Tests under `**/__tests__/**`, harnesses | Match new API |
| `openspec/specs/ubiquitous-language/spec.md`, `docs/glossary.md` | Structural terms + `state.name` fix |
| Living `fusion-service` | Aligned on archive; code must satisfy delta now |

---

### Task 1: Hydrate APIs on FusionCollections

**Files:**
- Modify: `src/model/fusionCollections.ts`
- Test: `src/model/__tests__/fusionAccount.test.ts` (or new `fusionCollections.hydrate.test.ts`)

**Interfaces:**
- Produces: e.g. `hydrateFromAttributeSets(input: { statuses?, actions?, reviews?, sources?, accountIds?, missingAccountIds?, previousAccountIds?, history? })` (exact names may match existing nested `statuses`/`accounts` APIs — prefer extending those over new `_internal_*`)

- [ ] **Step 1: Write failing test** — hydrate statuses/actions/reviews/account sets from plain arrays/sets; assert read-only getters match; assert no need for `_internal_*` from test
- [ ] **Step 2: Run test — expect fail**
  ```bash
  npx vitest run src/model/__tests__/fusionAccount.test.ts
  ```
- [ ] **Step 3: Implement hydrate/seed methods on `FusionCollections`** covering factory needs currently using `_internal_statuses`, `_internal_actions`, `_internal_reviews`, `_internal_sources`, `_internal_accountIds`, `_internal_missingAccountIds`, `_setPreviousAccountIds`, `_clearReviews`, history import
- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit** — `refactor(model): add FusionCollections hydrate APIs`

---

### Task 2: Origin/flag APIs on FusionLayers + factory migration

**Files:**
- Modify: `src/model/fusionLayers.ts`, `src/model/fusionAccount.ts` (factory helpers `applyAttributeCollections`, `applyOriginMetadata`, `from*`)
- Test: `src/model/__tests__/fusionAccount.test.ts`, `src/model/__tests__/fusionLayers.test.ts`

**Interfaces:**
- Consumes: Task 1 hydrate APIs
- Produces: layers methods for originSource/originAccount/disabled/uncorrelated/isIdentity/needsRefresh used by factories

- [ ] **Step 1: Write/adjust tests** asserting `fromFusionAccount` / `fromIdentity` / `fromManagedAccount` / `fromFusionDecision` outcomes unchanged
- [ ] **Step 2: Add layers setters/hydrate helpers** so factories stop assigning via ad-hoc field poking where encapsulated methods are clearer
- [ ] **Step 3: Rewrite factories** to call collections hydrate + layers APIs only — **zero** `_internal_*` references in `fusionAccount.ts`
- [ ] **Step 4: Ripgrep** `fusionAccount.ts` for `_internal_` — must be empty
  ```bash
  rg '_internal_' src/model/fusionAccount.ts
  ```
- [ ] **Step 5: `npx vitest run src/model/__tests__/`**
- [ ] **Step 6: Commit** — `refactor(model): factories use collaborator hydrate APIs`

---

### Task 3: Migrate fusionService callers

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`, `identityProcessor.ts`, `decisionProcessor.ts`, related non-test modules
- Test: `src/services/fusionService/__tests__/**`

- [ ] **Step 1: List call sites**
  ```bash
  rg -n '\.(addStatus|removeStatus|addAction|addIdentityLayer|addManagedAccountLayer|addFusionDecisionLayer|addAccountId|addFusionMatch)\(' src/services/fusionService --glob '*.ts'
  ```
- [ ] **Step 2: Migrate production files** to `account.collections…` / `account.layers…` / `account.correlation…` (keep flat methods temporarily so tests compile)
- [ ] **Step 3: Migrate fusionService tests** to collaborator API
- [ ] **Step 4: `npx vitest run src/services/fusionService/__tests__/`**
- [ ] **Step 5: Commit** — `refactor(fusionService): use FusionAccount collaborator API`

---

### Task 4: Migrate remaining services + operations

**Files:**
- Modify: matchingService, accountAssembly, definitionService (and any other hits), `src/operations/**`
- Test: corresponding `__tests__`, `ReplayAdapter.ts`

- [ ] **Step 1: Repo-wide list** (exclude `fusionAccount.ts` wrappers)
  ```bash
  rg -n '\.(addStatus|removeStatus|hasStatus|addAction|addIdentityLayer|addManagedAccountLayer|addFusionDecisionLayer|addAccountId|removeAccountId|addMissingAccountId|addFusionMatch|addReview|addSource)\(' src --glob '*.ts'
  ```
- [ ] **Step 2: Migrate each production module**
- [ ] **Step 3: Migrate tests + ReplayAdapter**
- [ ] **Step 4: Targeted vitest** for touched packages
- [ ] **Step 5: Commit** — `refactor: migrate callers to FusionAccount collaborator API`

---

### Task 5: Remove flat pass-throughs; lock API

**Files:**
- Modify: `src/model/fusionAccount.ts`
- Test: `src/model/__tests__/fusionAccount.test.ts`

- [ ] **Step 1: Write/adjust tests** for collaborator presence + `syncCollectionAttributesToBag` writing **current** bag only
- [ ] **Step 2: Delete flat 1:1 mutators/accessors** that only forward to collaborators (retain D4 surface: identity, bag, factories, configure, toISCAccount, true multi-collaborator helpers if any)
- [ ] **Step 3: `npx tsc --noEmit`** — fix any missed call sites
- [ ] **Step 4: `npx vitest run src/model/__tests__/`**
- [ ] **Step 5: Final ripgrep** — flat method names must not appear as `FusionAccount` methods; callers already migrated
- [ ] **Step 6: Commit** — `refactor(model): thin FusionAccount to collaborator facade`

---

### Task 6: Living docs — UL + glossary

**Files:**
- Modify: `openspec/specs/ubiquitous-language/spec.md` (Canonical Terms), `docs/glossary.md`
- Reference: `openspec/changes/finish-fusion-account-collaborator-api/specs/ubiquitous-language/spec.md`

- [ ] **Step 1: Fix Fusion account name** — replace `` (`state.name`) `` with `FusionAccount.name` / `name` property wording in UL + glossary
- [ ] **Step 2: Add Canonical Terms subsection** “Fusion account collaborators” with FusionCollections, FusionLayers, FusionCorrelation (disambiguate business correlation)
- [ ] **Step 3: Mirror the same entries in `docs/glossary.md`**
- [ ] **Step 4: Commit** — `docs: document FusionAccount collaborators; fix state.name`

---

### Task 7: JSDoc + verification + changelog

**Files:**
- Modify: JSDoc on `fusionAccount.ts`, `fusionCollections.ts`, `fusionCorrelation.ts`, `fusionLayers.ts`
- Modify: `docs/CHANGELOG.md` (via changelog-generator skill if available)

- [ ] **Step 1: JSDoc** — document public collaborator API; note FusionCorrelation ≠ business correlation
- [ ] **Step 2: Mark tasks 6.1/6.2 N/A** already recorded in tasks.md
- [ ] **Step 3: Full verify**
  ```bash
  npx tsc --noEmit
  npm run lint
  npm test
  ```
- [ ] **Step 4: Changelog entry** — developer-facing API migration + spec/glossary alignment; no tenant behavior change
- [ ] **Step 5: Commit** — `docs: changelog for FusionAccount collaborator API`

---

## Spec coverage map

| Scenario | Task |
|----------|------|
| Collaborators present on new FusionAccount | 5 |
| Status mutation via collections | 3–5 |
| Identity layer via layers | 3–5 |
| Factory hydration without `_internal_*` | 1–2 |
| Sync updates current bag | 5 |
| Glossary FusionCollections / Layers / FusionCorrelation | 6 |
| Structural vs business correlation | 6–7 |
| Fusion account name omits State | 6 |

## Done when

- [ ] All `tasks.md` checkboxes complete (incl. Documentation N/A rows + Changelog)
- [ ] `tsc`, lint, tests green
- [ ] No `FusionAccountState` / rule-module requirements left as the intended living contract after archive
