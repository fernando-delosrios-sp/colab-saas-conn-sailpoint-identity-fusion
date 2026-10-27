## ADDED Requirements

### Requirement: Optimized FusionAccount construction and static configuration

FusionAccount construction SHALL reuse a shared, precomputed static set of managed source names across all instances and SHALL initialize attribute bags in a single pass without redundant intermediate dictionary clones.

#### Scenario: FusionAccount shares precomputed static managed source names

- **GIVEN** a connector configuration with configured managed sources
- **WHEN** `FusionAccount.configure` is invoked at run start
- **THEN** it SHALL precompute a static `ReadonlySet<string>` of managed source names
- **AND** all newly constructed `FusionAccount` instances SHALL reference this shared static set rather than allocating per-instance sets

#### Scenario: Factory seeding performs single-pass attribute bag initialization

- **GIVEN** raw attributes from a platform account
- **WHEN** `fromFusionAccount` initializes the account's attribute bags
- **THEN** it SHALL omit nullish keys in a single pass for `attributeBag.current`
- **AND** it SHALL NOT create duplicate intermediate shallow copies of the attribute dictionary
