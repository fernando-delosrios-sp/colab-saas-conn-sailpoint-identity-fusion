## MODIFIED Requirements

### Requirement: Account list process phase reports match observability counters

When managed-account processing completes, the account list process phase SHALL log a summary when identity-phase Match observability counters on FusionRun are non-zero, including `mandatoryMissingBlockCount` when accounts were blocked with zero candidates due to missing indexed mandatory attributes, `fullScanFallbackCount` when getCandidates returned undefined and the full identity baseline was scored, `identityComparisonCount` for identity-phase comparisons, and `identityCandidateSetSizeSum` for the sum of identity pool sizes scored.

#### Scenario: Mandatory missing block summary
- **GIVEN** `run.mandatoryMissingBlockCount` is greater than zero after managed-account matching
- **WHEN** the process phase epilogue runs
- **THEN** a log line SHALL report the mandatory missing block count and explain that those accounts scored zero identity candidates

#### Scenario: Full-scan fallback summary
- **GIVEN** `run.fullScanFallbackCount` is greater than zero after managed-account matching
- **WHEN** the process phase epilogue runs
- **THEN** a log line SHALL report the full-scan fallback count and explain that those accounts scored the Fusion identity baseline

#### Scenario: Identity comparison summary
- **GIVEN** `run.identityComparisonCount` is greater than zero after managed-account matching
- **WHEN** the process phase epilogue runs
- **THEN** a log line SHALL report `identityComparisonCount` and `identityCandidateSetSizeSum`
