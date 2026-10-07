## ADDED Requirements

### Requirement: registerFusionAccount duplicate handling SHALL honor the Skip setting

FusionRun SHALL resolve the `skipDuplicateFusionAccounts` Developer Setting at run start. When registering a Fusion account whose Fusion identity already has a registered Fusion account with a different account key, FusionRun SHALL skip the duplicate (setting enabled) or overwrite the existing account (setting disabled). A registration with the same account key SHALL update the existing account in place regardless of the setting.

#### Scenario: Setting disabled overwrites the existing account
- **GIVEN** the `skipDuplicateFusionAccounts` Developer Setting is disabled
- **AND** a Fusion identity already has a registered Fusion account with account key `A`
- **WHEN** a Fusion account with account key `B` and the same Fusion identity is registered
- **THEN** the incoming account SHALL overwrite the existing account in the identity map
- **AND** a conflict warning SHALL be logged

#### Scenario: Setting enabled keeps the first account and skips the duplicate
- **GIVEN** the `skipDuplicateFusionAccounts` Developer Setting is enabled
- **AND** a Fusion identity already has a registered Fusion account with account key `A`
- **WHEN** a Fusion account with account key `B` and the same Fusion identity is registered
- **THEN** the incoming account SHALL NOT be registered
- **AND** the first account SHALL remain in the identity map
- **AND** a conflict warning SHALL be logged

#### Scenario: Same account key is an in-place update in both states
- **GIVEN** a Fusion identity already has a registered Fusion account with account key `A`
- **WHEN** a Fusion account with the same account key `A` is registered
- **THEN** the incoming account SHALL replace the existing account in the identity map
- **AND** no conflict warning SHALL be logged

#### Scenario: Duplicate is skipped even without reporting available
- **GIVEN** the `skipDuplicateFusionAccounts` Developer Setting is enabled
- **AND** no tracker or logger is attached to the run
- **WHEN** a Fusion account with a different account key for an already-registered Fusion identity is registered
- **THEN** the incoming account SHALL NOT be registered
