## Why

When a Fusion Match joins a managed account to an existing Fusion identity, the connector uses at least five synonyms (assign, link, authorized, automatic assignment, merge). That sprawl appears in spec, code, config labels, review forms, reports, and account history. Operators and developers cannot tell whether "assignment" means a Match outcome, an entitlement action, or attribute mapping. Aligning on **merge** for this Match outcome reduces ambiguity and matches language already used in parts of the codebase (`decisionProcessor`, connector help text).

## What Changes

**Match outcome vocabulary**
- From: automatic assignment, link to existing identity, assign-existing-identity
- To: automatic merge, merge with existing identity, merge-existing-identity
- Reason: Single canonical term for Match → existing identity
- Impact: Breaking — reports, dry-run output, email templates, tests

**Configuration**
- From: `fusionEnableAutoAssignment`, `fusionAutoAssignmentScore`, "Enable automatic assignment"
- To: `fusionEnableAutoMerge`, `fusionAutoMergeScore`, "Enable automatic merge"
- Reason: Config keys and UI align with merge vocabulary
- Impact: Breaking — stored connector configs (one-time read migration from old keys)

**Code identifiers**
- From: `fusionAssignmentDecisionMap`, `getFusionAssignmentDecision`, `authorizedLinkDecision`, `automaticAssignment`, `autoAssignedIdentityIds`, `markAutoAssigned`
- To: `fusionMergeDecisionMap`, `getFusionMergeDecision`, `mergeDecision`, `automaticMerge`, `autoMergedIdentityIds`, `markAutoMerged`
- Reason: Code matches ubiquitous language
- Impact: Internal + snapshot field `autoMergedIds`

**User-facing strings**
- Review form prompts: "merge with existing identity"
- History: "Auto-merged …", "Merged … by …"
- Heartbeat/events: `autoMerged` instead of `autoAssigned`

**Status entitlement (unchanged wire)**
- From glossary: "manually correlated to an identity by a reviewer"
- To: "status after manual merge by a reviewer" (`authorized` wire value unchanged)

## Capabilities

### New Capabilities

_(none — vocabulary alignment uses existing capability specs)_

### Modified Capabilities

- `ubiquitous-language`: Add Merge / Manual merge / Automatic merge; retire assign/link synonyms; update glossary table and retired terms
- `matching-service`: Exact-match and threshold paths use automatic merge; `FusionDecision.automaticMerge`
- `fusion-run`: `autoMergedIdentityIds`, `markAutoMerged`, snapshot `autoMergedIds`
- `log-service`: Operation heartbeat/event counters use `autoMerged`

## Impact

- **Config:** `connector-spec.json`, `matchingSettings.ts`, `FusionConfig` type
- **Core:** `formService`, `fusionService`, `decisionProcessor`, `correlationManager`, `matchOutcomeDispatcher`, `fusionCollections`, `form.ts`, `fusionRun.ts`
- **Reports/email:** `reportService`, `fusionReportBuilder`, `emailService/helpers`, `FusionReportDecision` type
- **Docs:** `docs/concepts/glossary.md`, `docs/guides/match.md`, matching-algorithms, account-list, README
- **Tests:** Unit tests, chain/golden artifacts referencing old strings or keys
- **OpenSpec:** Delta specs listed above; archive merges into `openspec/specs/`
