## ADDED Requirements

### Requirement: DefinitionService clears normal attributes on falsy or failed evaluation

When `DefinitionService` evaluates a Normal attribute definition and the template produces no value or evaluation fails, it MUST remove the attribute from the Fusion account unless a core-schema safe default applies.

#### Scenario: Falsy template output clears previously stored value
- **GIVEN** an existing Fusion account with attribute `formattedDate` set to `"2024-01-15"`
- **AND** a Normal definition for `formattedDate` whose expression evaluates to empty output (undefined/null after template pipeline)
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `formattedDate` MUST be removed from `fusionAccount.attributes`
- **AND** `formattedDate` MUST be removed from the Velocity evaluation context

#### Scenario: Template evaluation error clears previously stored value
- **GIVEN** an existing Fusion account with attribute `department` set to `"Engineering"`
- **AND** a Normal definition for `department` whose expression evaluation returns an error
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `department` MUST be removed from `fusionAccount.attributes`
- **AND** `department` MUST be removed from the Velocity evaluation context

#### Scenario: Core schema attribute receives safe default instead of clearing
- **GIVEN** a Fusion account with no valid value for `fusionDisplayAttribute`
- **AND** a Normal definition for the display attribute whose expression evaluates to empty output
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `fusionAttributeSafeDefault` MUST be applied for the display attribute
- **AND** the attribute MUST NOT be left empty

#### Scenario: Static definition with existing value skips evaluation
- **GIVEN** an existing Fusion account with a valid value for a Static Normal definition
- **WHEN** `refreshNormalAttributes` runs
- **THEN** the definition MUST NOT be evaluated
- **AND** the stored value MUST remain unchanged

---

## MODIFIED Requirements

### Requirement: DefinitionService evaluates Velocity templates for normal attributes

DefinitionService SHALL evaluate Apache Velocity templates for Normal attribute definitions, rendering values from the Velocity context built from the FusionAccount's attribute bag, managed account snapshots, identity data, and helper objects. When evaluation produces a non-nullish value, it SHALL write that value to `fusionAccount.attributes`. When evaluation produces a nullish value or fails, it SHALL clear the attribute per the clearing requirement unless a core-schema safe default applies.

#### Scenario: Normal attribute rendered from Velocity expression
- **WHEN** DefinitionService.refreshNormalAttributes is called with a FusionAccount
- **THEN** each Normal attribute definition's expression SHALL be evaluated against the Velocity context
- **AND** when the rendered value is non-nullish, it SHALL be written to `fusionAccount.attributes[definition.name]`

#### Scenario: Non-nullish rendered value overwrites existing value
- **GIVEN** an existing Fusion account with attribute `fullName` set to `"Jane Doe"`
- **AND** a Normal definition for `fullName` that evaluates to `"Jane Smith"`
- **WHEN** `refreshNormalAttributes` processes the definition
- **THEN** `fullName` MUST equal `"Jane Smith"`

---
