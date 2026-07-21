# Changelog

## 2.2.0

- (2026-07-21) **Performance:** Streamlined memory management by removing `streamAndClearEligibleAccounts` and `uniqueAttributesPhase`, integrating JIT unique attribute generation directly into the final aggregation output stream to reduce pipeline complexity while retaining strict OOM protections.
- (2026-07-21) **Performance:** Implemented early return architecture for Fusion Accounts to mitigate OOM risks by streaming and clearing eligible accounts directly within the pipeline. Refactored `IdentityService` to batch missing identity requests using Lucene OR queries, resolving N+1 latency bottlenecks.
- (2026-07-20) **Architecture:** Introduced `FusionRun`, a centralized state container that encapsulates all per-run state (`identityMap`, `managedAccountsById`, matching states, maps, and form decisions), completely managing state mutations.
- (2026-07-20) **Architecture:** Extracted `MapService`, `DefineService`, and `MatchService` from the legacy `AttributeService` and `ScoringService`, separating concerns and improving testability.
- (2026-07-20) **Architecture:** Rationalized dependency interfaces for fusion processors and handlers by injecting the `FusionRun` container directly instead of passing scattered service instances.
- (2026-07-20) **Architecture:** Simplified `RecordingService` to seamlessly snapshot the `FusionRun` state directly.
- (2026-07-20) **Enhancement:** Implemented trigram-based identity matching utilities and added comprehensive unit tests for core services.
- (2026-07-20) **Fix:** Updated aggregation event search query to properly escape source names and use regex matching for more robust event discovery in `SourceService`.
- (2026-07-19) **Terminology:** Restored the `run` vs `operation` distinction for per-run identifiers, replaced `unmatched` with `non-matched`, and removed the backward-compatible `pass` alias from the `sweep` field in `recordingService`.
- (2026-07-19) Aligned codebase with master ubiquitous-language spec: rewrote `openspec/specs/ubiquitous-language/spec.md` with canonical terms, account taxonomy, operation/run/phase/sweep vocabulary, matching vs scoring distinction, and retired-terms table. Updated `docs/concepts/glossary.md` to mirror the spec. Renamed code symbols to match canonical terms: `ManagedAccountPassRunner` → `ManagedAccountMatchingRunner`, `analyzeIdentityPhase`/`analyzeDeferredPhase` → `scoreIdentityCandidates`/`scoreDeferredCandidates`, `MatchCandidateType.NewUnmatched` → `MatchCandidateType.Deferred`, `runCorrelatedManagedAccountPrePass` → `runCorrelatedAccountSweep`, `hasIdentityBackedMatches` → `hasIdentityCandidateMatches`. Replaced retired terms across code, docs, and specs: `raw account` → `managed source account`, `identity-based` → `identity-origin`, `unmatched` → `non-matched`, `pass`/`Pass 1/Pass 2` (matching traversal) → `sweep`/`identity scoring sweep`/`deferred scoring sweep`. Removed `wireCandidateType` translation in dry-run payload (now emits `deferred` directly).
- (2026-07-17) Refactored `FusionAccount` into a dedicated `FusionAccountState` data container and focused rule modules (`constructionRules`, `layerRules`, `statusRules`, `actionRules`, `reviewRules`, `correlationRules`, `historyRules`), with `FusionAccount` retained as a thin delegation facade. No public API or behavior changed; improves maintainability and makes the large account model easier to review and extend.
- (2026-07-17) Extracted Velocity template evaluation into a dedicated `templateEvaluator.ts` module with `evaluateAttributeTemplate` and `applyOutputTransforms` functions. Standard Velocity semantics now apply: unresolved variables render literally (`$var` → `"$var"`); use `$!var` for quiet suppression.
- (2026-07-15) Added `$Normalize.ascii` Velocity helper for transliterating non-ASCII characters to ASCII, with optional language-specific digraph rules (German, Nordic).
- (2026-07-15) Added **Static** option to Normal attribute definitions — attributes are evaluated only when they have no value, preventing recalculation on subsequent aggregations.
- (2026-07-15) Added `$String` to available Velocity template helpers in connector-spec.
- (2026-07-01) Included identity name in account context and added support for match-based display attribute overrides during identity-name resolution.
- (2026-07-01) Fixed unintended automatic account pruning during identity and decision processing cycles.
- (2026-05-29) Introduced full i18n localization support for email templates and connector communications.
- (2026-05-29) Added support for complex JSON objects in attribute handling, ensuring schema casting preserves non-string types.
- (2026-05-29) Overhauled matching configuration in the connector specification, improving auto-assignment logic and adding conditional visibility for thresholds.
- (2026-05-29) Updated candidate badge reporting in Fusion reports to use 'Auto' and 'Manual' badges based on the configured automatic assignment match score threshold, replacing the legacy 'Exact' badge.
- (2026-05-28) Refactored the internal client service to support new API adapters and improved queue management.
- (2026-05-27) Enhanced schema discovery to dynamically include identity schema attributes when identities are in scope.
- (2026-05-21) Refactored `FusionService`, `FormService`, and `AttributeService` extracting helper functions to `helpers.ts` modules to improve maintainability and separate concerns.
- (2026-05-21) Refactored `FusionAccount` logic and extracted validation logic.
- (2026-05-21) Fixed `tsconfig.json` configuration for TypeScript compilation.
- (2026-05-08) Refactored `execute` method in `src/services/proxyService.ts` to reduce complexity and improve maintainability.
- (2026-05-08) Refactored `ensureIdentityProfileMapping` in `src/services/sourceService/sourceService.ts` for readability.
- (2026-05-07) Added missing test cases for `trigramIndex.ts` to improve test coverage.
- (2026-05-07) Improved performance by batching concurrent API calls in `fetchAccountSchema`.
- Added test coverage for formService helpers `buildCandidateList` and `getFormOwner`.
- **Refactor:** Extracted the core aggregation and dry-run execution pipeline phases into a shared helper function `executeSharedPipelinePhases` to prevent duplicate logging/sequence code.
- (2026-05-07) Bound identity enrichment batch sizes using `promiseAllBatched` to resolve unbounded API concurrency issues.
- (2026-05-07) Optimize N+1 fetch in `getRecipientEmails` by batch fetching missing identities.
- (2026-06-12) Fixed infinite loops in uniqueness counter generation.
- (2026-06-12) Synced `connector-spec.json` with default values.
- (2026-06-18) Added OpenSpec support for change-managed specifications.
- (2026-06-19) Extended orphan detection to identity-origin Fusion accounts and formalized architectural specifications.
- (2026-06-19) Unified identity-name precedence and removed legacy flat-key fallbacks in Velocity snapshots.
- (2026-06-21) Initialized Repomix configuration and ignore patterns.
- (2026-06-22) Updated project dependencies and internal modules within `.opencode`.
- (2026-06-22) Renamed `fusionAverageScore` to `fusionManualReviewScore` and implemented identity attribute schema discovery.
- (2026-06-23) Fixed `maxLength` ordering so it is applied as the final output transform after trim, case, spaces, and normalization.
- (2026-06-23) Implemented a version update procedure for the Identity Fusion NG connector.
- (2026-06-24) Replaced exact-match auto-assignment with configurable threshold-based automatic assignment settings.
- (2026-06-24) Added cascade aggregation and localization settings to the connector specification.
- (2026-06-24) Added a localization guide and documented the cascade aggregation process.
- (2026-06-24) Added parent key and value constraints to the automatic assignment match score field.
- (2026-06-24) Made `fusionAutoAssignmentScore` mandatory and enforced strict threshold validation against the manual review score.
- (2026-06-24) Consolidated Fusion account identity-name resolution: `IdentityInfo` now exposes distinct `id`, alias `name`, and human-readable `displayName` chains; `FusionAccount.name` resolves to the source title only; `fusionDisplayAttribute` and `fusionIdentityAttribute` are now immutable once set (with a UUID fallback for missing identity attributes); identity decisions use mapping/definition config for display resolution. The Fusion Review Decisions card now renders human-readable account names and links the "Created new identity" entry to the ISC account page.
- (2026-06-26) Added an optional **Skip match if threshold not met** toggle on Fusion attribute match rules. When enabled, non-mandatory rules whose computed similarity is below their configured minimum are excluded from the weighted combined match score, so weak signals no longer drag the combined score down. Mandatory rules are always evaluated regardless of this toggle. Documented in the matching guide and the README matching rules reference.
- (2026-06-26) Added a new **Binary (Exact Match)** algorithm to Fusion attribute match configuration. It returns a score of 100 only when the two values are identical strings (case- and whitespace-sensitive) and 0 otherwise, making threshold configuration trivial for stable identifiers (employee IDs, UUIDs, pre-normalized emails). Forgiving comparison can still be achieved by pre-normalizing values in **Define** before applying Binary.
- (2026-06-26) Refactored connector internals: added `SourceService` getters for delayed-aggregation and reverse-correlation sources, consolidated account-create identity-name resolution into a shared `resolveIdentityNameFromCreateInput` helper, aligned composite managed-account key handling (now normalized consistently via `getManagedAccountKeyFromAccount`), introduced `OperationContext` enum for `FusionService`, extracted batching into a dedicated module (`src/services/fusionService/batching.ts`), and added `isSet`/`isNotSet` aliases plus type-safe `Account.attributes` helpers and `FusionAccount` attribute accessors (`getAttribute`, `getStringAttribute`, `hasAttribute`).
- (2026-06-26) Added per-operation C4 container diagrams (`.drawio`) under `docs/operations/diagrams/` for `testConnection`, `accountList`, `accountRead`, `accountCreate`, `accountUpdate`, `accountEnable`, `accountDisable`, `entitlementList`, `accountDiscoverSchema`, and `custom:dryrun`.
- (2026-06-26) Clarified and tightened operation documentation (`account-read`, `account-create`, `account-enable`, `account-update`, `entitlement-list`) to reflect current setup, rebuild, cascade-aggregation, and output flows.

## 2.1.7 - 2026-06-22

- Fixed identity schema discovery bugs (undefined names, casing overwrites, type mapping, and error propagation).
- Renamed `tenant` mapped attribute reference to `mainAccount` in connector logic and documentation.
- Removed legacy `_id` fallback from Velocity Context account snapshots.
- Streamlined identity name assignment in FusionAccount and FusionService.
- Identity-origin accounts are now orphaned only when their origin identity is outside the configured identity scope.
- Identity-origin accounts now set the Fusion identity attribute to the source identity id.
- Consolidated UUID and incremental-counter generation as sub-modes of the Unique attribute type.
- Added `$isUnique(value)` helper for Unique Velocity expressions.
- Improved Velocity context for identity-backed accounts and `$sources` Map access.
- Updated connector-spec help text and `docs/guides/define.md` for the new Unique/UUID/counter behavior.
- Updated dependencies and npm `allowScripts` policy; added OpenSec support.
- Added AI-powered PR review workflows using Cursor and OpenCode agents.
- Refactored `getManagedAccountKeyFromAccount` to return `buildManagedAccountKey` directly.
- Fixed `maxLength` output transform ordering — now applied after trim/case/spaces/normalize, so final value is exactly ≤ `maxLength` instead of shorter due to post-truncation trimming.
- Added counter-aware `maxLength` truncation for Unique definitions: counter character width is reserved from the budget before prefix truncation, ensuring the assembled value (prefix + counter) does not exceed `maxLength`.

## 2.1.6 - 2026-04-29

- Improved performance by caching listSourceSchemas API results.
- Added PR CI review orchestration with refactor, documentation, and README changelog gates.
- Added deterministic PR quality checks for refactor review, code documentation review, and docs/changelog review.
