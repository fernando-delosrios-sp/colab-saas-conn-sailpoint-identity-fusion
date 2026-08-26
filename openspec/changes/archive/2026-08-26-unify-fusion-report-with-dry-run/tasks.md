## 1. Capture and preview mode

- [x] 1.1 Include `run.isDryRunMode` in Match report-slice capture (`shouldCaptureManagedAccountReportData`) so dry-run and Fusion report do not depend on `fusionReportOnAggregation` or `custom:dryrun`
- [x] 1.2 Activate `DryRunApiAdapter` and dry-run Match-as-account-list analysis for the nested `runReportPipeline` only; keep Output unstreamed (`throughPhase: 4`)
- [x] 1.3 Tests: dry-run with `fusionReportOnAggregation: false` still writes match cards; Fusion report pipeline issues no live write SDK calls

## 2. Titles and delivery

- [x] 2.1 Add aggregation report title constant and i18n key `'Identity Fusion Aggregation Report'`; keep Fusion report as `'Identity Fusion Report'` and dry-run as `'Identity Fusion Dry Run Report'`
- [x] 2.2 `generateAndSendFusionReport` / aggregation epilogue use the aggregation title; `report` action uses the Fusion report title
- [x] 2.3 Tests: rendered titles for the three artifacts; Fusion report Match cards match dry-run tracker rendering

## 3. Action wiring

- [x] 3.1 Update `reportAction` / `runReportPipeline` comments and callers to Fusion report (not “aggregation-style”)
- [x] 3.2 Tests: account-update and account-create `report` Add follow the Fusion report contract (preview + email, no list stream)

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test`
- [x] 4.2 All delta spec scenarios covered by named automated tests
- [x] 4.3 `npm run lint` passes

## 5. Documentation

- [x] 5.1 Update `docs/glossary.md` with the five terms; align FusionReport entitlement text
- [x] 5.2 Update `docs/use-guides/configuration/managing-reviewers.md`, `review-forms-and-reviewers.md`, `analyze-with-dry-run.md`
- [x] 5.3 Update `docs/operations/account-list.md`, `account-update.md`, `account-create.md`, `entitlement-list.md`, `dry-run.md` so aggregation email is not called Fusion report
- [x] 5.4 Update JSDoc on `generateReport`, `runReportPipeline`, `ReportService` title constants

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via changelog-generator during apply
- [x] 6.2 Confirm entry covers user-visible title and Fusion report preview changes
