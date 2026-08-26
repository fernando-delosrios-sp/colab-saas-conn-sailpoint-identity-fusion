# fusion-service Delta

## ADDED Requirements

### Requirement: Match report slices are captured for dry-run and Fusion report
`FusionService` SHALL populate managed-account Match report tracker slices when the operation run is in dry-run mode, when aggregation-on-owner reporting is enabled, or when record mode is active. Capture SHALL NOT depend solely on the command not being account-list.

#### Scenario: Dry-run account-list captures slices
- **GIVEN** account-list dry-run mode
- **AND** `fusionReportOnAggregation` is false
- **WHEN** a managed account completes Match analysis
- **THEN** the aggregation tracker SHALL receive the corresponding match, deferred, or non-match report row

#### Scenario: Fusion report nested pipeline captures slices
- **GIVEN** the `report` action nested preview pipeline with dry-run mode active
- **WHEN** a managed account completes Match analysis
- **THEN** the aggregation tracker SHALL receive the corresponding report row
- **AND** ISC write calls for forms, merge, and correlation SHALL remain inhibited
