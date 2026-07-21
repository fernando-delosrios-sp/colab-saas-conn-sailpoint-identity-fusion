<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->
# Exploration of ponytail-audit findings

## Background
We ran a `ponytail-audit` on the repository to find areas of over-engineering, unused abstractions, and redundant dependencies. The audit flagged 7 potential cuts.

## Decision Chain
- **Q: Which dependencies are safe to drop completely in favor of native Node APIs?**
  - `uuid`: Node 14.17+ has `crypto.randomUUID()`. **Decision:** Drop `uuid`.
  - `form-data`: Node 18+ has native `FormData`. **Decision:** Drop `form-data`.
- **Q: Are there any internal interfaces that act as single-implementation wrappers (YAGNI)?**
  - `WorkQueue` is only implemented by `FusionRun`.
  - `LockService` is only implemented by `InMemoryLockService`.
  - **Decision:** Drop both interfaces and type directly to the concrete classes.
- **Q: Should we drop `transliteration` for native regex stripping?**
  - Native `String.prototype.normalize('NFD')` handles Latin diacritics but fails on complete transliterations (like Cyrillic to Latin). Since `normalizeAscii` requires deterministic ASCII output for global identifiers, dropping this could cause regressions for non-Latin usernames.
  - **Decision:** Do not cut.
- **Q: Should we drop `axios` and `axios-retry` in favor of native `fetch`?**
  - The `@sailpoint/sailpoint-api-client` SDK is built entirely on Axios. `axios-retry` is explicitly used to override the SDK's retry configuration. We cannot cut this without breaking the SDK's expected configuration.
  - **Decision:** Do not cut.

## Proposed Action
Execute only the safe, zero-regression cuts: replacing `uuid` and `form-data` with native features, and removing the YAGNI interfaces `WorkQueue` and `LockService`.
