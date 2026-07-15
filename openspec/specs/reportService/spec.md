# reportService Spec


## Requirements



### Requirement: Report Fusion Blends section
The system SHALL surface blended accounts in a dedicated "FUSION BLENDS" section in the HTML aggregation report.

#### Scenario: Aggregation completes with blended accounts
- **WHEN** an aggregation run completes and one or more managed accounts have been blended into a Fusion account
- **THEN** the report SHALL include a "FUSION BLENDS" section
- **THEN** this section SHALL visually match the layout of "FUSION REVIEW DECISIONS"
- **THEN** this section SHALL display the target Fusion account and the blended managed account details

#### Scenario: Aggregation completes with no blended accounts
- **WHEN** an aggregation run completes and no managed accounts were blended
- **THEN** the report SHALL NOT include the "FUSION BLENDS" section
