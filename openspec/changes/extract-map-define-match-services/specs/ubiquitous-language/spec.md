# ubiquitous-language Spec (Delta)

## ADDED Requirements

### Requirement: Services are stateless; FusionRun is the single source of truth

All services SHALL be stateless strategy objects that receive FusionRun for accessing and modifying mutable state. The FusionRun object SHALL be the single source of truth for all mutable data during an operation run. No service SHALL hold mutable run-scoped state internally.

#### Scenario: Services read from FusionRun
- **WHEN** a service needs access to managed accounts, identities, Fusion accounts, or matching state
- **THEN** it SHALL read from the FusionRun instance
- **AND** it SHALL NOT read from internally-owned maps or sets

#### Scenario: Services write to FusionRun
- **WHEN** a service modifies run-scoped data
- **THEN** it SHALL write to the FusionRun instance
- **AND** it SHALL NOT accumulate state internally

## MODIFIED Requirements

### Requirement: Code uses canonical terms

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments. The retired term **AttributeService** SHALL be replaced with **MapService** or **DefineService** as appropriate. The retired term **ScoringService** SHALL be replaced with **MatchService**.

#### Scenario: Variable naming follows ubiquitous language (updated)
- **WHEN** a developer declares a variable representing the map service
- **THEN** the variable SHALL be named `mapService`, not `attributeService`
- **WHEN** a developer declares a variable representing the match service
- **THEN** the variable SHALL be named `matchService`, not `scoringService`

#### Scenario: Function naming follows ubiquitous language (updated)
- **WHEN** a developer creates a function that calls the map service
- **THEN** the function SHALL reference `mapService.mapAttributes`, not `attributeService.mapAttributes`

#### Scenario: Type naming follows ubiquitous language (updated)
- **WHEN** a developer defines a type, enum, or class for match outcomes
- **THEN** the type SHALL reference `MatchService`, not `ScoringService`

### Requirement: Retired terms are not reintroduced

Retired terms and symbols SHALL NOT be reintroduced into code, configuration, or documentation. The retired term list SHALL include `AttributeService` and `ScoringService` in addition to the previously retired terms.

#### Scenario: Code review discovers AttributeService reference
- **WHEN** a code review finds `AttributeService` in identifiers or imports
- **THEN** the contributor SHALL rename to `MapService` or `DefineService` based on the phase being referenced

#### Scenario: Code review discovers ScoringService reference
- **WHEN** a code review finds `ScoringService` in identifiers or imports
- **THEN** the contributor SHALL rename to `MatchService`

## Canonical Terms Additions

### Services

| Term | Definition |
|------|------------|
| **MapService** | The stateless service responsible for the **Map** step — merging attributes from managed source accounts into the Fusion account schema using configurable merge strategies. Located at `src/services/mapService/`. |
| **DefineService** | The stateless service responsible for the **Define** step — computing normal attributes via Velocity templates and generating persistent unique attributes (UUIDs, counters, disambiguated values). Located at `src/services/defineService/`. |
| **MatchService** | The stateless service responsible for the **Match** step — comparing Fusion accounts against existing identities using weighted scoring rules and dispatching match outcomes (exact match, partial match, deferred match, non-match). Located at `src/services/matchService/`. |
| **FusionRun** | The centralized state container for a single operation run. Holds all mutable data loaded during the run (managed accounts, identities, Fusion accounts, form decisions, matching state) and serves as the single source of truth that stateless services read from and write to. Exposes `snapshot()` and `restore()` for recording and replay. Located at `src/model/fusionRun.ts`. |

## Retired Terms Additions

| Retired Term | Canonical Replacement |
|--------------|----------------------|
| `AttributeService` | `MapService` (for attribute mapping/merging) + `DefineService` (for attribute computation and unique value generation) |
| `ScoringService` | `MatchService` (scoring remains as the computation technique within matching) |
| `attribute-service` (spec) | `map-service` + `define-service` |
| `scoring-service` (spec) | `match-service` |
