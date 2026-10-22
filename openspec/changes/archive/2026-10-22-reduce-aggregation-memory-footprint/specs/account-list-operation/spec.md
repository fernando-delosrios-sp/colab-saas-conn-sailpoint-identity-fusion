## ADDED Requirements

### Requirement: Raw Fusion account fetch cache cleared after Refresh

The account-list operation SHALL clear the raw Fusion account fetch cache (`fusionAccountsByNativeIdentity`) at the end of the Refresh phase, after all persisted Fusion accounts have been rebuilt into derived Fusion accounts. In record mode the cache SHALL be retained for the whole run, matching the record-mode retention of the managed-account cache. Single-account operations SHALL be unaffected; they fetch their own raw Fusion account copy.

#### Scenario: Cache cleared entering Process

- **GIVEN** a persistent account-list operation not in record mode
- **WHEN** the Refresh phase completes
- **THEN** the raw Fusion account fetch cache SHALL be cleared
- **AND** the Process, Output, and report epilogue steps SHALL run without reading raw Fusion account bodies

#### Scenario: Record mode retains cache for the whole run

- **GIVEN** a persistent account-list operation in record mode
- **WHEN** the Refresh phase completes
- **THEN** the raw Fusion account fetch cache SHALL still be populated
- **AND** the cache SHALL be retained through the epilogue as before (the post-epilogue clear is itself skipped in record mode)

#### Scenario: JIT unique attribute refresh survives early clear

- **GIVEN** an aggregation with unique attribute definitions
- **AND** a Fusion account that requires unique attribute refresh at Output
- **WHEN** Output serializes that account after the raw cache was cleared at Refresh
- **THEN** the generated unique attribute values SHALL be identical to those produced before this change

#### Scenario: Report epilogue resolves account ids after early clear

- **GIVEN** a persistent aggregation with the aggregation report enabled
- **WHEN** the report epilogue runs after the raw cache was cleared at Refresh
- **THEN** report account-id resolution SHALL produce the same ids as before this change (via FusionRun maps and `managedAccountInventory`)
