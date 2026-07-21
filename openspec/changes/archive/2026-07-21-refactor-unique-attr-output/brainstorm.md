<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

## Background
We recently introduced an "early send" option (via `streamAndClearEligibleAccounts`) in the `uniqueAttributesPhase` (Phase 5). This mitigated OOM risks by sending accounts that do not need unique attribute refresh to the platform early and removing them from memory.

## Problem
The current pipeline split is awkward. The pipeline diverges into:
1. `streamAndClearEligibleAccounts` (Early send)
2. `refreshUniqueAttributes`

Both are followed by a separate `outputPhase` which sends the *rest* of the accounts via `sendAccountsToPlatform`.

## Proposed Solution (JIT stream)
Remove the concept of "early send" and Phase 5 altogether.
Instead, process unique attribute generation as a *Just-In-Time (JIT) complementary step* during the output phase.
As we loop over all accounts to send them to the platform, we check if they need unique attributes. If they do, we call `refreshUniqueAttributes(account)` right before serializing and sending.

### Pros
- Simplifies the pipeline elegantly. Eliminates an entire phase and the `streamAndClearEligibleAccounts` hack.
- Consistent true streaming: every account goes through the exact same output funnel.
- Identical OOM protection. Accounts are still deleted immediately after sending.

### Risks
- **Stateful Counters in Dry Run**: Unique attribute generation is stateful (increments counters). If we place this logic directly inside the universal `getISCAccount()` serializer, it would trigger during single account reads and dry runs, potentially burning counters unintentionally.
- **Mitigation**: We must implement this JIT generation inside the `sendAccountsToPlatform` callback loop (or similar `streamToPlatform` output mechanism), NOT inside the pure `getISCAccount` serializer. This ensures it only happens during the proper aggregation output phase where counters should actually advance.
