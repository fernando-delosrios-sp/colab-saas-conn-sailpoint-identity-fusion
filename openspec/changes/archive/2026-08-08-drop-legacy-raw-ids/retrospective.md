# Retrospective: drop-legacy-raw-ids

## Outcome

Implementation complete. Composite-key-only contract enforced across rebuild, reconstruction, form/correlation paths, and schema descriptions.

## What worked

- Targeted test updates (`rebuildFusionAccount`, `managedAccountKey`, fusion account tests) gave high confidence without full-suite churn.
- Spec deltas cleanly separated REMOVED legacy scenario from ADDED composite-only requirements.

## Follow-ups

- Pre-existing `matching-service/match-outcome-dispatch` spec missing Purpose section (unrelated validate failure).
