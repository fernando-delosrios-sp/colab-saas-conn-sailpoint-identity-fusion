# Retrospective: fix-duplicate-attribute-names

> Written: 2026-07-30 (after verify passed)
> Worktree: uncommitted implementation + change artifacts

---

## 0. Evidence

- **Commit range**: uncommitted (no dedicated commits yet)
- **Diff size**: ~8 files touched in `src/services/schemaService/`, docs, CHANGELOG
- **Tasks done**: 15/15
- **Active hours**: ~1 session
- **Subagent dispatches**: n/a (direct apply)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass
- **Test coverage signal**: vitest 26/26 in `src/services/schemaService`

---

## 1. Wins

- Shared `dedupeSchemaAttributesByName` helper used at both discover and ingest paths — single source of truth
- Regression tests cover production collision pairs (`Username`/`username`, `FirstName`/`firstname`, `LastName`/`lastname`)
- Prior partial dedup (merge-on-collision) replaced with clear first-wins semantics matching ISC case-insensitivity

## 2. Misses

- 📌 Initial `buildDynamicSchema` used inline Map logic duplicating the helper — caught at verify, refactored to collect-then-dedupe
- 📌 Unrelated duplicate `import { translate }` in localization WIP blocked schema tests during re-verify

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.1 | Refactored again post-verify to call shared helper | Verify SUGGESTION for DRY adherence |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (via opsx-propose) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:subagent-driven-development | ✗ |
| test-driven-development | ✓ (tests before/alongside implementation) |
| finishing-a-development-branch | ✗ (not reached) |

### Deliberately Skipped Skills

- **subagent-driven-development**
  - **What was skipped**: Per-task subagent dispatch
  - **Why this cycle**: Single focused bugfix with clear plan; direct apply in one session
  - **How to prevent recurrence**: Use subagents when change spans 3+ independent modules or >20 tasks

## 5. Surprises

- `buildDynamicSchema` already had case-insensitive Map dedup but merge-on-collision overwrote metadata — not the same as "keep first found"
- Test suite blocked by unrelated WIP parse error in email localization file

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Collect-then-dedupe for ordered merges** → **Promote to memory**
  > **Why**: Inline Map dedup during merge duplicates helper logic and drifts from design
  > **How to apply**: When merging ordered lists with first-wins dedup, append to array then call shared dedupe function
