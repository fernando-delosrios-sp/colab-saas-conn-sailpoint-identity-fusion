## REMOVED Requirements

### Requirement: Entitlement list returns all entitlements

**Reason**: Replaced with type-split status vs action catalog contract.

**Migration**: Use ADDED requirements in this change.

## ADDED Requirements

### Requirement: Entitlement list returns static status entitlements without API calls

When invoked with `type: status`, the entitlement-list operation SHALL stream static status entitlements from connector definitions without additional ISC API calls.

#### Scenario: Status entitlements listed from static catalog

- **GIVEN** a valid connector configuration
- **WHEN** the entitlement-list operation is invoked with `type: status`
- **THEN** the connector SHALL stream each static status entitlement via `res.send`
- **AND** SHALL NOT fetch managed sources for status listing

### Requirement: Entitlement list returns dynamic action entitlements including reviewer scopes

When invoked with `type: action`, the entitlement-list operation SHALL fetch all sources and stream static action entitlements (`report`, `fusion`, `correlated`) plus one `reviewer:<sourceId>` action entitlement per configured managed source.

#### Scenario: Action entitlements include static and reviewer entries

- **GIVEN** managed sources `Source A` (id `src-a`) and `Source B` (id `src-b`) are configured
- **WHEN** the entitlement-list operation is invoked with `type: action`
- **THEN** the connector SHALL fetch all sources
- **AND** SHALL stream static action entitlements for `report`, `fusion`, and `correlated`
- **AND** SHALL stream `reviewer:src-a` and `reviewer:src-b` action entitlements

### Requirement: Entitlement list rejects invalid entitlement types

When invoked with an unsupported `type` value, the entitlement-list operation SHALL fail with a ConnectorError.

#### Scenario: Invalid entitlement type fails with observable message

- **GIVEN** a valid connector configuration
- **WHEN** the entitlement-list operation is invoked with an unsupported `type`
- **THEN** the operation SHALL fail with a ConnectorError whose message matches `Invalid entitlement type <type>`
