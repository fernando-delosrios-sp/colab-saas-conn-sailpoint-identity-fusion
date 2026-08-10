# Data-driven testing process

Identity Fusion NG supports two complementary test layers: **scenario recording/replay** for integration regression against real ISC API traces, and **in-process scenario harness tests** for deterministic sweep-based validation.

## Goals

- Keep test inputs editable and reviewable (JSON artifacts).
- Re-run aggregations deterministically with the same recorded or fixture data.
- Capture generated outputs, side effects, and match score breakdowns for diff review.

## Scenario recording and replay

For capture, replay, and proxy prerequisites, see [Capture scenarios for replay](../operation/capture-scenarios-for-replay.md).

Artifact schemas and External Settings field reference: [Scenario recording](../../reference/scenario-recording.md).

### Harness unit tests (no recordings required)

```bash
npm test -- src/operations/__tests__/scenario/chain.replay.test.ts
npm test -- src/operations/__tests__/scenario/orchestrator.integration.test.ts
```

These validate the replay adapter, step orchestration, and golden comparison logic using in-repo fixtures.

### `reports/matching-results.json` schema

Written after record-mode account-list completes:

- `version`, `recordedAt`, `operation` — artifact metadata
- `sweepSummary` — `{ processed, exact, partial, deferred, nonMatch }` counts
- `identityMatches` — identity-origin matches with candidate scores
- `deferredMatches` — deferred candidate rows with per-attribute scores
- `nonMatches` — analyzed non-match accounts
- `failedMatches` — accounts where matching failed

Record mode automatically enables managed-account report capture. Scenarios recorded before this artifact existed must be re-recorded.

## Dry-run validation (pre-production)

Before changing Match thresholds or source settings in production, run a non-persistent dry-run against a representative sample. See [Analyze changes with dry-run](../operation/analyze-with-dry-run.md).

## Required assertions (regression checklist)

When validating a scenario or fixture after configuration changes:

- Sweep 1 should create potential/candidate matching state without over-correlation.
- Sweep 2 (when present) should apply submitted review decisions deterministically.
- Correlation and non-match counts should be stable across replays.
- Disable side effects for orphan sources should match recorded expectations.
- Single-account operation tests remain isolated from account-list lifecycle tests.

## Related resources

| Topic | Resource |
| --- | --- |
| Scenario capture workflow | [Capture scenarios for replay](../operation/capture-scenarios-for-replay.md) |
| Scenario artifact reference | [Scenario recording](../../reference/scenario-recording.md) |
| Dry-run tuning workflow | [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) |
| Source and scope setup | [Configuring sources and scope](../configuration/configuring-sources-and-scope.md) |
| Troubleshooting common issues | [Troubleshooting](troubleshooting.md) |
