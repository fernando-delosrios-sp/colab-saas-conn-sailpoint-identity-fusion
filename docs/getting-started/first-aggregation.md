# First aggregation

Run and verify your first Fusion source account aggregation after connection and configuration are in place.

**Prerequisites:** Complete [Overview — Day 1–5 checklist](overview.md) (connection, scope, Map/Define, and Match if used).

## Steps in ISC

1. **Discover schema** — Admin → Connections → Sources → your Fusion source → **Discover Schema**. Confirm the combined account schema loads without errors.
2. **Identity profile** — Attach an identity profile and provisioning plan as required by your ISC deployment.
3. **Run aggregation** — Trigger **Account aggregation** on the Fusion source (or wait for the scheduled task).
4. **Monitor logs** — Open Application Logs or your external logging endpoint. Search for `PHASE 1 Setup` through `PHASE 5 Output` and `EPILOGUE report` (see [Config to account-list phases](../reference/config-to-phases.md)).

## Verification checklist

| Check | Expected result | If it fails |
| --- | --- | --- |
| **Test connection** | Review and Test succeeds | [Troubleshooting — Connection and authentication](../use-guides/validation-and-troubleshooting/troubleshooting.md#category-1-connection-and-authentication) |
| **Managed sources exist** | All configured source names resolve | Verify source names match ISC exactly |
| **Accounts emitted** | Fusion accounts appear in ISC after aggregation | Check scope, source filters, and `Skip accounts with a missing identifier` |
| **Match outcomes** (if Match enabled) | Review forms, auto-merge, or non-matched entitlements as configured | [Matching identities](../use-guides/configuration/matching-identities.md) |
| **No reset flags stuck** | **Reset accounts?** / **Reset forms?** auto-disable after one run | Clear flags in Developer Settings if a run aborted mid-flight |
| **Log phases complete** | `PHASE N … END elapsed=` for phases 1–5; epilogue runs | [Config to account-list phases](../reference/config-to-phases.md) |

## Dry-run before production Match changes

For Match tuning without persisting ISC writes, run account-list with dry-run mode:

```json
{
  "dryRun": {
    "enabled": true,
    "saveFile": true
  }
}
```

See [Dry-run analysis](../use-guides/operation/dry-run-analysis.md) for the full workflow and HTML report interpretation.

## Read next

| Goal | Resource |
| --- | --- |
| Map config settings to log phases | [Config to account-list phases](../reference/config-to-phases.md) |
| Tune Match for your sources | [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |
| Common issues | [Troubleshooting](../use-guides/validation-and-troubleshooting/troubleshooting.md) |
