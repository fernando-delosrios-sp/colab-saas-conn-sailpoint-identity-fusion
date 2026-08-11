## ADDED Requirements

### Requirement: Offline scenario verification SHALL not false-fail on recording age

When `npm run test-recording` or the in-process scenario verification harness replays a scenario whose capture date is older than `fusionFormExpirationDays`, verification MUST NOT fail solely because form definitions are wall-clock stale if those forms were active at the recorded step time.

#### Scenario: Aged recording passes when simulated time is wired

- **GIVEN** a valid scenario directory captured more than `fusionFormExpirationDays` before the verification run
- **AND** step goldens include form-driven outcomes (review URLs, fusion identity decisions, merged accounts)
- **WHEN** a developer runs `npm run test-recording -- tenant/scenario`
- **THEN** replay MUST process forms that were active at the recorded step timestamp
- **AND** MUST NOT report drift caused only by wall-clock stale form cleanup

#### Scenario: Unit test covers stale partition with simulated time

- **GIVEN** a Vitest test sets FusionRun simulated time to a fixed ISO timestamp
- **WHEN** form stale partition runs against fixture form definitions with known created dates
- **THEN** active vs stale classification MUST match expectations relative to simulated time, not test run wall clock
