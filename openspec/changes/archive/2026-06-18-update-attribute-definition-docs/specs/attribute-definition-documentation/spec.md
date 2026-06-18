# attribute-definition-documentation Specification

## Purpose

Capture the documentation-accuracy requirements for Identity Fusion NG's attribute-definition help text and guides. The connector has two user-facing documentation surfaces (the in-app help in `connector-spec.json` and the user guide at `docs/guides/define.md`) plus a quick-reference table in `README.md`. This spec ensures all three describe the actual behavior of the attribute-definition pipeline — including the available Velocity context, helper methods, the `$isUnique` helper, the `$counter` auto-append rules, the nested snapshot key convention, and the `maxAttempts` default.

This spec intentionally does not change runtime behavior. The connector code is the source of truth; the docs must match it.

## ADDED Requirements

### Requirement: Velocity context variables are accurately documented

The three documentation surfaces MUST describe the Velocity context variables actually available in attribute-definition expressions, with names and shapes that match the implementation in `src/services/attributeService/attributeService.ts:683-701`.

#### Scenario: Normal section help lists all standard context variables
- **GIVEN** the in-app help for the Normal attribute definitions section
- **WHEN** a user reads the section help
- **THEN** it documents the following context variables: mapped attributes by name (`$firstname`, `$lastname`, ...), `$identity`, `$accounts`, `$account`, `$previous`, `$sources`, `$originSource`, and `$originAccount`
- **AND** it does not document any context variable that is not actually set in `buildVelocityContext()`

#### Scenario: Account snapshot shape uses nested source and schema
- **GIVEN** the in-app help for the Normal section
- **WHEN** it describes the fields on each `$accounts[]` entry
- **THEN** it uses the nested shape `source.id`, `source.name`, `schema.id`, `schema.name`, plus `IIQDisabled`
- **AND** it does not document legacy flat keys (`_name`, `_source`, `_sourceId`, `_nativeIdentity`) as the canonical access pattern. (The legacy keys may still be referenced for backward compatibility if the implementation still resolves them, but the nested shape must be documented as the primary form.)

#### Scenario: $sources is documented as a Map keyed by source name
- **GIVEN** the in-app help for the Normal section
- **WHEN** it describes `$sources`
- **THEN** it explains that `$sources` is keyed by source name and accessed via `$sources.get('SourceName')`
- **AND** it does not show `$sources.SourceName` (dot-access is not supported on a JavaScript Map from Velocity)

#### Scenario: $account versus $accounts[0] is explained
- **GIVEN** the in-app help for the Normal section
- **WHEN** it describes `$account`
- **THEN** it explains that `$account` is the origin snapshot (the managed account matching the origin id, or the identity-backed row when the origin is `Identities`)
- **AND** it notes that `$accounts[0]` may differ from `$account` when the `mainAccount` attribute is set, in which case the `mainAccount` snapshot is moved to `$accounts[0]`

### Requirement: Velocity helper methods are accurately documented

The three documentation surfaces MUST list the helper methods actually exposed by `$Datefns`, `$Normalize`, `$AddressParse`, `$JSON`, and `$Math` in `src/services/attributeService/contextHelpers.ts` and `src/services/attributeService/dateUtils.ts`.

#### Scenario: Datefns methods are listed
- **GIVEN** any documentation surface mentions `$Datefns`
- **WHEN** it describes the available methods
- **THEN** it lists `format`, `parse`, `parseISO`, `getYear`, `addDays`, `addMonths`, `addYears`, `subDays`, `subMonths`, `subYears`, `isBefore`, `isAfter`, `isEqual`, `differenceInDays`, `startOfDay`, `endOfDay`, `now`, `isValid`

#### Scenario: Normalize.date and Normalize.phone optional parameters are documented
- **GIVEN** any documentation surface mentions `$Normalize.date`
- **WHEN** it describes the signature
- **THEN** it shows that `Normalize.date(date, ambiguousPriority?)` accepts an optional priority string like `"MM-dd-yyyy,dd-MM-yyyy"` to control ambiguous date parsing
- **AND** for `$Normalize.phone`
- **THEN** it shows that `Normalize.phone(phone, defaultCountry?)` accepts an optional default country code (e.g. `"GB"`) used when the input lacks an international prefix

#### Scenario: JSON helper methods are documented
- **GIVEN** any documentation surface mentions `$JSON`
- **WHEN** it describes the available methods
- **THEN** it lists `stringify(value)` and `parse(text)`, noting that `parse` returns `undefined` for null/non-string/empty/invalid input and `stringify` returns `""` on failure

### Requirement: $isUnique helper is documented in all three surfaces

The `$isUnique(value)` helper is a feature in `src/services/attributeService/attributeService.ts:1174-1176` that lets a Unique attribute definition test whether a candidate value (after applying the same output transforms the definition would apply) is currently free in the registered-in-use set. This helper MUST be mentioned in all three documentation surfaces.

#### Scenario: connector-spec.json mentions $isUnique
- **GIVEN** the in-app help for the Unique section and the unique-definition expression helpKey
- **WHEN** a user reads either
- **THEN** `$isUnique(value)` is mentioned as a helper available inside unique-attribute expressions

#### Scenario: define.md $isUnique example is preserved
- **GIVEN** the `docs/guides/define.md` guide
- **WHEN** it describes the Unique type
- **THEN** it includes the `$isUnique(value)` example showing conditional candidate selection between formats before the connector falls back to automatic `$counter` disambiguation

#### Scenario: README $isUnique mention exists
- **GIVEN** the per-attribute definition table in `README.md`
- **WHEN** it describes the Velocity context for unique attributes
- **THEN** `$isUnique(value)` is mentioned as available inside unique-attribute expressions

### Requirement: $counter auto-append rules are documented accurately

The connector auto-appends `$counter` to unique-attribute expressions that do not include `$counter` or `$UUID`, with one important exception. These rules MUST be described accurately in all documentation surfaces.

#### Scenario: Velocity-directive skip is documented
- **GIVEN** any documentation surface describes the `$counter` auto-append behavior
- **WHEN** a user reads it
- **THEN** it explains that the auto-append is skipped when the expression contains Velocity directives (`#if`, `#set`, `#else`, `#end`, etc.) because appending after `#end` would break parsing
- **AND** it explains the workaround: include `$counter` explicitly in expressions that use directives

#### Scenario: Empty first try is documented
- **GIVEN** any documentation surface describes the `$counter` variable in collision mode
- **WHEN** a user reads it
- **THEN** it explains that `$counter` renders as the empty string on the first try and as the padded counter (zero-padded per `Minimum counter digits`) on subsequent attempts

### Requirement: maxAttempts default is 20

The default value for `maxAttempts` in the connector is 20, set in `src/data/config/settings/uniqueAttributeDefinitionsSettings.ts:7`. All documentation surfaces that quote a default for `maxAttempts` MUST state `20`, not `100` or any other value.

#### Scenario: README documents maxAttempts default as 20
- **GIVEN** the Attribute Definition Settings table in `README.md`
- **WHEN** it documents the default for `maxAttempts`
- **THEN** it shows `20`, not `100`

#### Scenario: define.md documents maxAttempts default as 20
- **GIVEN** the global settings table in `docs/guides/define.md`
- **WHEN** it documents the default for `Maximum attempts for unique Define generation`
- **THEN** it shows `20`, not `100`

#### Scenario: connector-spec.json matches
- **GIVEN** the in-app help for the unique `maxAttempts` field
- **WHEN** a user reads the help text
- **THEN** it shows `Default: 20`

### Requirement: Attribute "Type" is Normal or Unique only

The connector's `UniqueAttributeDefinition` model in `src/model/config.ts:91-112` does not have separate `type: 'uuid'` or `type: 'counter'` discriminators. UUID and incremental counter are sub-modes of Unique, activated by including `$UUID` in the expression or by setting `useIncrementalCounter: true`. Documentation MUST NOT present UUID or Counter as separate top-level attribute types; they MUST be described as sub-modes of the Unique type.

#### Scenario: README does not present UUID and Counter as separate types
- **GIVEN** the per-attribute definition table in `README.md`
- **WHEN** a user reads the table
- **THEN** the available attribute types are listed as `Normal` and `Unique` only
- **AND** for the `Unique` type, the table notes that UUID and incremental counter are sub-modes of Unique (UUID by referencing `$UUID` in the expression, counter by toggling `Use incremental counter?`)

#### Scenario: define.md does not present UUID and Counter as separate types
- **GIVEN** the `docs/guides/define.md` guide
- **WHEN** a user reads the "Attribute types explained" section
- **THEN** it has only the `Normal type` and `Unique type` subsections
- **AND** the `Unique type` subsection covers UUID (by including `$UUID` in the expression) and incremental counter (via the `Use incremental counter?` toggle) as modes of Unique
- **AND** there is no separate "UUID type" or "Counter-based type" subsection describing them as standalone types

#### Scenario: UUID is not described as "no expression needed"
- **GIVEN** any documentation surface describes how to generate a UUID attribute
- **WHEN** a user reads it
- **THEN** it does not claim that "no expression is needed" or that "any expression is ignored"
- **AND** it explains that the expression field is required and must contain `$UUID` for UUID generation to occur

### Requirement: Expression field is required for Unique definitions

The `UniqueAttributeDefinition.expression` field is typed as a required `string` in `src/model/config.ts:91-112` and is read by `generateUniqueAttributeValue` at `src/services/attributeService/attributeService.ts:988-997`. Documentation MUST mark the expression as required and MUST NOT claim that the expression is optional or ignored.

#### Scenario: README marks expression as required for unique
- **GIVEN** the per-attribute definition table in `README.md`
- **WHEN** it lists the `Apache Velocity expression` field for Unique-type attributes
- **THEN** it is marked as required (matching the `Normal` type requirement)
- **AND** the description notes that the expression must reference `$UUID` for UUID generation, or `$counter` (or include it implicitly for collision disambiguation), to produce a unique value

#### Scenario: define.md marks expression as required for unique
- **GIVEN** the per-attribute definition table in `docs/guides/define.md`
- **WHEN** it lists the `Apache Velocity expression` field for Unique-type attributes
- **THEN** it is marked as required
