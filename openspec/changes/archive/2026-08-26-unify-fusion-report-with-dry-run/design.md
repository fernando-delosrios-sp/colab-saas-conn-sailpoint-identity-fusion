## Context

Account-list dry-run already runs the full Match tree with `DryRunApiAdapter` and optional HTML. The `report` action reuses report HTML types but runs under account-update/create (`isAggregationAccountListMode` false), so scoring is captured while auto-merge, forms, deferred drain, and disable are skipped. Aggregation-on-owner email shares the Fusion report title. Fusion review email is a separate product.

## Goals / Non-Goals

**Goals:**

- Canonical names: dry-run report, Fusion report, aggregation report, Fusion Review decision section, Fusion review
- Fusion report = same Match preview as dry-run, triggered from ISC
- Distinct user-visible titles; shared Handlebars template
- No ISC persistence on either analysis path

**Non-Goals:**

- Streaming a full account-list from account-update/create
- Changing recipients (dry-run: `sendEmail` / `saveFile`; Fusion report: global owners; aggregation report: owners when enabled)
- Unifying recording artifacts (`aggregation.json`, `matching-results.json`, `replay-report.json`)
- Changing Fusion review form behavior

## Decisions

### D1: Preview mode for the report action

- **Choice**: Inside `reportAction` / `runReportPipeline` only, activate dry-run (`DryRunApiAdapter` + `run.isDryRunMode`) and treat Match as account-list analysis for that nested pipeline (full outcome tree). Still stop after Process (no Output stream). Then render and email the Fusion report to global owners.
- **Reason**: Same Match preview without turning account-update into account-list.
- **Considered alternatives**: Names-only (rejected — Fusion report would still be a lighter cousin). Invoke `accountList` with dry-run from update (rejected — would stream every Fusion account on a provisioning command).

### D2: Capture Match report slices whenever preview or aggregation report is on

- **Choice**: Populate tracker match/deferred/non-match slices when `run.isDryRunMode` or `fusionReportOnAggregation` (or record mode). Dry-run and Fusion report no longer depend on the retired `custom:dryrun` constructor flag or on aggregation-on-owner being enabled.
- **Reason**: After dry-run moved onto account-list, capture was easy to miss unless `fusionReportOnAggregation` was on.
- **Considered alternatives**: Keep capture tied to `!isAggregationAccountListMode` (rejected — that is why the action captured scores while skipping outcomes).

### D3: Distinct titles, one template

- **Choice**: Keep one Handlebars template. Titles: dry-run report = existing dry-run title; Fusion report = *Identity Fusion Report*; aggregation report = a distinct aggregation title (new i18n key). Drop unused render branching on `reportType` or map it 1:1 to those three artifacts.
- **Reason**: Glossary must be visible in the inbox.
- **Considered alternatives**: One title for all HTML (rejected — that is today’s confusion).

### D4: Fusion Review decision section stays a section

- **Choice**: Applied FusionDecision rows remain a section of the HTML document, primarily meaningful on the aggregation report. Analysis reports may include fetched/in-memory decisions but MUST NOT persist new ones. Fusion review remains the “review required” email/form, not a report.
- **Reason**: User-locked split between report products and review notification.
- **Considered alternatives**: Separate post-review report product (rejected — not requested).

### D5: Recipients unchanged

- **Choice**: Delivery policy stays per trigger. Same preview, not the same mailbox rules.
- **Reason**: Discovery scoped recipient policy out.
- **Considered alternatives**: Always email owners from dry-run (rejected — dry-run is operator-controlled).

## Risks / Trade-offs

[Risk] Preview Match tree on a large tenant from ISC entitlement request can be as expensive as dry-run. -> Mitigation: same cost as today’s `runReportPipeline` fetch/process; document that Fusion report is a full analysis, not a cheap entitlement.

[Risk] Enabling aggregation-mode Match during account-update could leak writes if dry-run adapter is not active. -> Mitigation: activate adapter before Process; tests assert no live PATCH/POST/DELETE.

[Trade-off] Fusion report still does not stream account rows. -> Reason: account-update/create cannot emit an aggregation listing; preview is the HTML (and logs), not `res.send` of every account.

## Migration Plan

Connector release: title strings and Fusion report contents change for existing `report` access profiles and aggregation-on-owner emails. No config key rename. Rollback is revert. Docs/glossary ship in the same change.

## Open Questions

None.
