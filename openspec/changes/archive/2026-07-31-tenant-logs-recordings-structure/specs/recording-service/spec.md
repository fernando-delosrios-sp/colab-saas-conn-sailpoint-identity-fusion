## ADDED Requirements

### Requirement: Recording chain directories SHALL be tenant-scoped on disk

When `RecordingService` writes chain artifacts in record mode, the chain directory MUST be rooted at `recordings/<tenant>/{chainName}/` where `<tenant>` is the filesystem-safe slug derived from connection `baseurl` using the same rules as log-service tenant slug derivation. The tenant subdirectory MUST be created automatically before the first write. Repo-relative paths embedded in manifests and `scenario.json` MUST use the matching `recordings/<tenant>/{chainName}` form.

#### Scenario: Record mode writes under tenant subdirectory

- **GIVEN** `config.recording.mode` is `'record'`
- **AND** `config.recording.chainName` is `'prod-baseline'`
- **AND** connection `baseurl` is `https://acme.api.identitynow.com`
- **WHEN** `RecordingService` persists chain artifacts
- **THEN** files MUST be written under `recordings/acme/prod-baseline/`

#### Scenario: Two tenants with the same chain name do not collide

- **GIVEN** proxy server processes tenant A with `baseurl` `https://acme.api.identitynow.com` and tenant B with `baseurl` `https://globex.api.identitynow.com`
- **AND** both use `recordingName` `'prod-baseline'`
- **WHEN** each tenant completes a recorded account-list operation
- **THEN** tenant A artifacts MUST exist only under `recordings/acme/prod-baseline/`
- **AND** tenant B artifacts MUST exist only under `recordings/globex/prod-baseline/`

#### Scenario: Replay resolves tenant-scoped chain directory

- **GIVEN** `config.recording.mode` is `'replay'`
- **AND** `config.recording.chainName` is `'prod-baseline'`
- **AND** connection `baseurl` is `https://acme.api.identitynow.com`
- **AND** `recordings/acme/prod-baseline/scenario.json` exists
- **WHEN** `RecordingService` initializes for replay
- **THEN** it MUST load artifacts from `recordings/acme/prod-baseline/`

#### Scenario: Missing baseurl uses unknown-tenant recording root

- **GIVEN** `config.recording.mode` is `'record'`
- **AND** connection `baseurl` is missing or unparseable
- **WHEN** `RecordingService` persists chain artifacts for chain `'local-test'`
- **THEN** files MUST be written under `recordings/unknown-tenant/local-test/`
