## REMOVED Requirements

### Requirement: Dry run executes without making changes

**Reason**: The `custom:dryrun` operation is being removed. Its non-persistent execution behavior is absorbed into the `account-list-operation`'s new dry-run mode via the `dryRun.enabled` input parameter.

**Migration**: Invoke `std:account:list` with `{ dryRun: { enabled: true } }` instead of `custom:dryrun`. The new mode produces 1-to-1 `StdAccountListOutput` rows (no enrichment payloads). The analysis value that previously appeared in `matchingStatus`/`reportCategories`/`review` row decorations now lives in the HTML report (via `saveFile`) or report email (via `sendEmail`).
