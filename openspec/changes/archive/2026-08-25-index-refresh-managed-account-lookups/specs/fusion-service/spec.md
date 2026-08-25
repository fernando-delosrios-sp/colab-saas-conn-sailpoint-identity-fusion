## ADDED Requirements

### Requirement: Previous and missing managed account keys use targeted queue lookups

When `FusionLayers.addManagedAccountLayer` re-blends managed source accounts for persisted Fusion rows, `processPreviousRunMatchedAccounts` SHALL resolve accounts by looking up each normalized key in `previousAccountIds` and `missingAccountIds` via `FusionRun.get(key)` (or equivalent O(1) queue lookup). It SHALL NOT iterate all entries in the managed-account work queue to find matching keys.

#### Scenario: Large queue with few previous keys avoids full scan

- **GIVEN** a managed-account work queue containing thousands of entries
- **AND** a Fusion account whose `previousAccountIds` contains two keys present in the queue
- **WHEN** `addManagedAccountLayer` runs during Refresh
- **THEN** exactly those two accounts SHALL be blended and claimed
- **AND** the implementation SHALL NOT invoke a full-queue iteration over all queue entries for this path

#### Scenario: Missing key absent from queue is skipped

- **GIVEN** a Fusion account with `missingAccountIds` containing a key not present in the work queue
- **WHEN** previous/missing re-blend runs
- **THEN** processing SHALL continue without error
- **AND** no account SHALL be blended for that key

#### Scenario: Uncorrelated status updates preserved for matched keys

- **GIVEN** a managed source account in the queue matching a previous-run key on a Fusion account
- **WHEN** targeted lookup blends the account
- **THEN** uncorrelated status and missing-account collection updates SHALL match pre-change behavior for that key
- **AND** `queue.claimAccount` SHALL be invoked for the blended key
