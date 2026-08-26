## Why

“Fusion report” currently names the `report` entitlement, the ad-hoc HTML email, the aggregation-on-owner email, and is easily confused with Fusion review. Operators cannot tell a Match preview from a post-aggregation summary. The `report` action also does not run the same Match tree as dry-run, so “preview from ISC” is not true. Canonical names plus a unified preview path make docs, titles, and ISC triggers mean the same thing.

## What Changes

**Report and review vocabulary**
- From: Fusion report used for entitlement, ad-hoc HTML, aggregation email, and loosely for review traffic
- To: Dry-run report, Fusion report, aggregation report, Fusion Review decision section, Fusion review
- Reason: One noun cannot cover analysis, post-run summary, and review notification
- Impact: Non-breaking for ISC APIs; docs, glossary, email titles, and entitlement copy change

**Fusion report Match preview**
- From: `report` action runs phases 1–4 without dry-run adapter; Match resolution short-circuits because the command is not account-list
- To: Fusion report is the same Match preview as dry-run (full outcome tree, writes inhibited), triggered from ISC; no account-list stream on update/create
- Reason: User-locked meaning of Fusion report
- Impact: Non-breaking for tenants (still no persist); HTML cards may include outcomes previously omitted

**Report titles**
- From: Dry-run uses a distinct title; aggregation and `report` action both use *Identity Fusion Report*; `reportType` is unused at render
- To: Distinct titles for dry-run report, Fusion report, and aggregation report; same Handlebars family
- Reason: Titles must match glossary
- Impact: Recipients see different subject lines

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `ubiquitous-language`: Canonical report/review communication terms; FusionReport entitlement points at Fusion report
- `report-service`: Distinct titles; Fusion report delivery; shared template family
- `account-update-operation`: Report action produces Fusion report (dry-run-equivalent preview)
- `account-create-operation`: Same Fusion report contract on create
- `account-list-operation`: Dry-run report capture and title stay distinct from aggregation report
- `fusion-service`: Match report slices captured for dry-run and Fusion report, not only aggregation-on-owner

## Impact

- Code: `reportAction` / `runReportPipeline` / `buildReportContext`, `DryRunApiAdapter`, Match mode during preview, `shouldCaptureManagedAccountReportData`, `ReportService` titles, locale keys
- Docs: `docs/glossary.md`, use-guides (reviewers, review settings, dry-run), operations (account-list, account-update, entitlement-list, dry-run)
- Out of scope: recording JSON artifacts, `ScoreReport`, Fusion review form locale, recipient policy
