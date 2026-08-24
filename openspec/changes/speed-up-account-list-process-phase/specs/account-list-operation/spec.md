## ADDED Requirements

### Requirement: Process-phase correlated sweep reports skip-linked volume in aggregate

During the account-list Process-phase correlated sweep, skip-linked drops (correlated managed accounts already linked in Fusion) SHALL NOT produce per-account INFO lines. After the sweep (or on the correlated-sweep STEP END), the connector SHALL emit at most one INFO-level DETAIL (or STEP END detail fields) that includes the skip-linked drop count and remaining work-queue size. Immediate warn and error lines for matching and correlation failures SHALL remain unchanged.

#### Scenario: Skip-linked volume is one DETAIL not N INFO lines

- **GIVEN** 2000 correlated managed accounts already linked in Fusion
- **WHEN** the Process-phase correlated sweep runs at default INFO log level
- **THEN** individual INFO lines that name each dropped managed account SHALL NOT appear
- **AND** one DETAIL or STEP END SHALL report the skip-linked count for that sweep

#### Scenario: Record unique registration remains a Process step before uncorrelated sweep

- **GIVEN** match-disabled Record managed accounts on the work queue
- **WHEN** Process phase runs
- **THEN** record unique registration SHALL still complete after the correlated sweep and before the uncorrelated match sweep
- **AND** those Record accounts SHALL still be removed from the uncorrelated sweep queue
