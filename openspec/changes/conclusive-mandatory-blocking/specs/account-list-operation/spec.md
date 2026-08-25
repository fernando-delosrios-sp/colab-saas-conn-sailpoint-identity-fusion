## MODIFIED Requirements

### Requirement: Account list process phase reports match observability counters

When managed-account processing completes, the account list process phase SHALL log a summary when trigram observability counters on FusionRun are non-zero, including `mandatoryMissingBlockCount` when accounts were blocked with zero candidates due to missing indexed mandatory attributes, and `fullScanFallbackCount` when applicable for blocking-unavailable fallbacks.

#### Scenario: Mandatory missing block summary
- **GIVEN** `run.mandatoryMissingBlockCount` is greater than zero after managed-account matching
- **WHEN** the process phase epilogue runs
- **THEN** a log line SHALL report the mandatory missing block count and explain that those accounts scored zero identity candidates
