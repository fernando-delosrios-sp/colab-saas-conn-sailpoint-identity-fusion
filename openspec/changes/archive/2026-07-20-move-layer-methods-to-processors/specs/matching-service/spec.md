## MODIFIED Requirements

### Requirement: MatchingService receives FusionRun for state access

MatchingService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchingService SHALL NOT hold internal mutable state beyond configuration and caches. When recording a Fusion match result on a FusionAccount, MatchingService SHALL import `addFusionMatch` from `src/model/fusionAccountRules/layerRules.ts` and invoke it as a free function with `fusionAccount.state`.

#### Scenario: MatchingService reads fusion identities from FusionRun
- **WHEN** MatchingService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: MatchingService writes match outcomes to FusionRun
- **WHEN** MatchingService creates a new Fusion account from a non-match
- **THEN** the account SHALL be written to run.fusionAccountMap
- **AND** autoAssigned identity IDs SHALL be written to run.autoAssignedIdentityIds

#### Scenario: MatchingService records FusionMatch via free function
- **WHEN** MatchingService.compareFusionAccounts produces a FusionMatch
- **THEN** it SHALL call `addFusionMatch(fusionAccount.state, fusionMatch)` as an imported free function
- **AND** it SHALL NOT call `fusionAccount.addFusionMatch(fusionMatch)` as a method
