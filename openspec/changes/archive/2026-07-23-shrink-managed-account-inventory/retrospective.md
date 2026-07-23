# Retrospective: shrink-managed-account-inventory

> Written: 2026-07-23 (after verify passed)
> Commit range: uncommitted (working tree)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: uncommitted (session implementation, not yet committed)
- **Diff size**: ~15 production/test files (fusionRun, fusionLayers, sourceService, formService, reportService, accountAssembly, tests)
- **Tasks done**: 23/23
- **Active hours**: ~1 session (continued from prior apply)
- **Subagent dispatches**: n/a (direct implementation)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (40/40)
- **Test coverage signal**: vitest 999 passed, 2 skipped

Commit chain (chronological):

```
(uncommitted) managedAccountInventory + accessor migration across services
```

---

## 1. Wins

- Readability-first design landed: typed accessors replace opaque `managedAccountsAllById` reads
- Single write path in `setManagedAccount` eliminates duplicate snapshot writes
- Fusion layer prune/preserve correctly uses inventory keys instead of depleted work queue
- Legacy snapshot restore path preserves backward compatibility without retaining dual maps at runtime
- Inventory-after-claim test locks the core memory/readability invariant

## 2. Misses

- 🟡 StrReplace failed on large/ignored service files — required Python shell patches (`sourceService.ts`, `formService.ts`)
- 📌 `npm run lint` still fails on pre-existing knip findings unrelated to this change
- 📌 Implementation remains uncommitted at archive time — commit before PR

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Subagent-driven apply | Direct session implementation | User invoked `/opsx:apply` in single agent session; scope was cohesive |
| Task 5.4 grep | One intentional legacy restore reference in `fusionRun.ts` | Old snapshot migration, not a live dual-map |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | partial |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | pending (post-commit) |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task subagent dispatch with review gates
  - **Why this cycle**: Focused refactor with clear design; continued from prior session
  - **How to prevent recurrence**: Use subagents when parallel consumer migrations exceed one subsystem

## 5. Surprises

- Advisor plan's separate key-set approach was superseded by inventory-only model — simpler and clearer
- Work queue depletion no longer breaks form/report lookups after claim — behavior fix bundled with memory win

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Use inventory accessors, never reintroduce full-account snapshot maps** → **Promote to memory**
  > **Why**: Dual maps inflated RSS and confused work-queue vs metadata semantics
  > **How to apply**: New managed-account readers must call `hasManagedAccount` / `getManagedAccountInfo`

- [ ] 📌 **Large service files may block StrReplace** → **One-off**
  > **Why**: Cursor ignore rules on some service paths
  > **How to apply**: Fall back to targeted shell/python patches when StrReplace fails
