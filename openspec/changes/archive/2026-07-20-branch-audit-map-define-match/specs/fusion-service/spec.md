## ADDED Requirements

### Requirement: FusionService avoids redundant delegation wrappers

FusionService SHALL NOT wrap outcome handler methods with single-line delegation methods. Internal references to outcome handlers SHALL directly access `this.outcomeHandler` to improve readability and maintainability.

#### Scenario: Calling outcome handlers directly
- **WHEN** FusionService evaluates match outcomes
- **THEN** it calls methods directly on `this.outcomeHandler` (e.g. `this.outcomeHandler.handleIdentityMatch`) rather than proxying through `this.handleIdentityMatch`
