## ADDED Requirements

### Requirement: Use Native APIs for UUID and FormData
The system MUST use native Node.js APIs (`crypto.randomUUID()` and `FormData`) instead of external dependencies (`uuid` and `form-data`) to reduce package footprint.

#### Scenario: Generating UUIDs
- **WHEN** a unique identifier is required for a correlation or fusion process
- **THEN** the system uses `crypto.randomUUID()` to generate it

#### Scenario: Processing multipart forms
- **WHEN** the system communicates with the API using multipart payloads
- **THEN** it uses native `FormData`

## REMOVED Requirements

### Requirement: Use WorkQueue and LockService interfaces

**Reason**: These interfaces were determined to be over-engineered (YAGNI) as they only possess single implementations.

**Migration**: Internal consumers MUST directly reference `FusionRun` and `InMemoryLockService`.
