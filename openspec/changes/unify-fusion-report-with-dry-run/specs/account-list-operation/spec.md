# account-list-operation Delta

## ADDED Requirements

### Requirement: Dry-run report captures Match slices without aggregation-on-owner
When account-list runs in dry-run mode, the connector SHALL populate Match report tracker slices (identity matches, deferred matches, analyzed non-matches, failed matching) even when **Send report to owner on aggregation?** is disabled. Capture SHALL NOT require the retired `custom:dryrun` operation context.

#### Scenario: Dry-run Match cards without aggregation report setting
- **GIVEN** dry-run mode with `saveFile` or `sendEmail` enabled
- **AND** `fusionReportOnAggregation` is false
- **WHEN** Process completes
- **THEN** the dry-run report SHALL include potential-match account cards from the tracker
- **AND** SHALL NOT persist Fusion review forms or correlation writes

## MODIFIED Requirements

### Requirement: Dry-run report aligns with aggregation report
The dry-run report SHALL use `includeNonMatches: false` (consolidated counters only, no per-account non-matched rows) and SHALL render through the same Handlebars template and email delivery path as the aggregation report. The report title SHALL use the `'Identity Fusion Dry Run Report'` constant to distinguish analysis from the aggregation report and from the Fusion report.

#### Scenario: Dry-run report email matches aggregation report structure
- **WHEN** a dry-run report email is delivered
- **THEN** the email SHALL use the same subject format, Handlebars template, and section layout as the aggregation report
- **AND** the title SHALL be `'Identity Fusion Dry Run Report'`
