# attribute-definition-documentation Specification

## Purpose
TBD - created by archiving change update-attribute-definition-docs. Update Purpose after archive.
## Requirements
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

Feature: Fusion account attribute resolution
Rule: The connector auto-appends $counter to unique-attribute expressions that do not include $counter or $UUID.

#### Scenario: Velocity-directive skip is documented
- **GIVEN** any documentation surface describes the `$counter` auto-append behavior
- **WHEN** a user reads it
- **THEN** it explains that the auto-append is skipped when the expression contains Velocity directives (`#if`, `#set`, `#else`, `#end`, etc.) because appending after `#end` would break parsing
- **AND** it explains the workaround: include `$counter` explicitly in expressions that use directives

#### Scenario: Empty first try is documented
- **GIVEN** any documentation surface describes the `$counter` variable in collision mode
- **WHEN** a user reads it
- **THEN** it explains that `$counter` renders as the empty string on the first try and as the padded counter (zero-padded per `Minimum counter digits`) on subsequent attempts

#### Scenario: maxLength reserves space for counter so total does not exceed limit
- **GIVEN** any documentation surface describes `maxLength` in the context of Unique attribute definitions
- **WHEN** a user reads it
- **THEN** it explains that when `$counter` is active, its character length is reserved from the `maxLength` budget so the final value (prefix + counter + suffix) does not exceed `maxLength`
- **AND** it notes that this means the non-counter portion of the value may be shorter than `maxLength` to accommodate the counter

#### Scenario: UUID expressions skip auto-append and resolve collisions by recalculation
- **GIVEN** any documentation surface describes the auto-append behavior
- **WHEN** a user reads it
- **THEN** it explains that expressions containing `$UUID` do NOT have `$counter` auto-appended
- **AND** it notes that when collisions occur for such expressions, a new UUID is generated instead of relying on a counter

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

### Requirement: maxLength is applied after all other output transforms

`maxLength` MUST be the final output transform applied to an attribute definition's generated value. The complete canonical pipeline is: Velocity render → `trim` → `case` → `spaces` → `normalize` → `maxLength` truncation. No step after `maxLength` may add or remove characters.

Feature: Attribute definition output transforms
Rule: maxLength truncation MUST run after trim, case, spaces, and normalize so the final value length is exactly ≤ maxLength.

#### Scenario: trim runs before maxLength so the final value is not shorter than intended
- **GIVEN** an attribute definition with `maxLength: 10` and `trim: true`
- **AND** the Velocity expression renders to `"  hello world  "` (15 chars including spaces)
- **WHEN** the output transforms are applied
- **THEN** trim produces `"hello world"` (11 chars)
- **AND** maxLength truncates to `"hello worl"` (exactly 10 chars)
- **AND** the stored value is `"hello worl"`, not a shorter whitespace-free string

#### Scenario: case transform runs before maxLength
- **GIVEN** an attribute definition with `maxLength: 5` and `case: lower`
- **AND** the Velocity expression renders to `"ABCDEF"` (6 chars)
- **WHEN** the output transforms are applied
- **THEN** case produces `"abcdef"` (6 chars)
- **AND** maxLength truncates to `"abcde"` (exactly 5 chars)

#### Scenario: normalize runs before maxLength
- **GIVEN** an attribute definition with `maxLength: 5` and `normalize: true`
- **AND** the Velocity expression renders to `"café́s"` (which normalizes/transliterates to a longer ASCII string)
- **WHEN** the output transforms are applied
- **THEN** normalize runs first
- **AND** maxLength truncates the normalized result to 5 chars

#### Scenario: no transforms leaves maxLength as sole truncation
- **GIVEN** an attribute definition with `maxLength: 8` and no other transforms enabled
- **AND** the Velocity expression renders to `"abcdefghij"` (10 chars)
- **WHEN** the output transforms are applied
- **THEN** the stored value is `"abcdefgh"` (exactly 8 chars)

### Requirement: Counter length is reserved from the maxLength budget before truncation

When a `$counter` value is active in the Velocity context for a Unique attribute definition, the counter's rendered character width MUST be subtracted from the `maxLength` budget before the non-counter portion of the string is truncated, so that the final assembled value (prefix + counter + suffix) does not exceed `maxLength`.

Feature: Attribute definition output transforms
Rule: For Unique definitions with maxLength and an active counter, the counter occupies part of the maxLength budget.

#### Scenario: counter length is reserved so assembled value fits in maxLength
- **GIVEN** a Unique attribute definition with `maxLength: 10`
- **AND** `$counter` resolves to `"01"` (2 chars)
- **AND** the expression prefix before counter renders to `"johndoe"` (7 chars) after post-processing
- **WHEN** maxLength truncation is applied with counter reservation
- **THEN** available budget for the non-counter portion is `10 - 2 = 8` chars
- **AND** since `7 ≤ 8`, the prefix is kept in full
- **AND** the final value is `"johndoe01"` (9 chars ≤ 10)

#### Scenario: prefix is trimmed when prefix + counter exceeds maxLength
- **GIVEN** a Unique attribute definition with `maxLength: 8`
- **AND** `$counter` resolves to `"01"` (2 chars)
- **AND** the expression renders to `"johndoe01"` (9 chars) with prefix `"johndoe"` (7 chars)
- **WHEN** maxLength truncation is applied with counter reservation
- **THEN** available budget for prefix is `8 - 2 = 6` chars
- **AND** the prefix is truncated to `"johndo"` (6 chars)
- **AND** the final value is `"johndo01"` (exactly 8 chars)

#### Scenario: isUnique helper applies same counter-aware truncation as production path
- **GIVEN** a Unique attribute definition with `maxLength: 8` and an active counter of `"01"`
- **WHEN** the `$isUnique(value)` helper evaluates a candidate value
- **THEN** it applies the same trim → case → spaces → normalize → counter-aware maxLength pipeline
- **AND** the transformed candidate it checks against the registered-in-use set matches the value that the production path would store

### Requirement: `$Normalize.address` optional country parameter is documented

The three documentation surfaces MUST describe the optional `country` parameter for `$Normalize.address` and the supported country codes.

#### Scenario: `Normalize.address` signature is documented

- **GIVEN** any documentation surface mentions `$Normalize.address`
- **WHEN** a user reads the description
- **THEN** it shows that `Normalize.address(address, country?)` accepts an optional country code such as `"US"`, `"GB"`, or `"UK"`
- **AND** it explains that the default is `"US"` when omitted
- **AND** it notes that unsupported country codes fall back to trimmed original input

#### Scenario: `Normalize.address` behavior examples are documented

- **GIVEN** any documentation surface mentions `$Normalize.address`
- **WHEN** a user reads the examples
- **THEN** it includes an example showing a full US state name normalized to a code, such as `$Normalize.address("Los Angeles, California 90001", "US")` producing `"Los Angeles, CA 90001"`
- **AND** it includes an example showing a UK region name normalized to a code, such as `$Normalize.address("London, Greater London SW1A 2AA", "GB")` containing `"LND"`

### Requirement: `$AddressParse.getStateName` and `$AddressParse.getStateCode` are documented

The three documentation surfaces MUST list the new `$AddressParse` lookup methods and their signatures.

#### Scenario: `AddressParse` method list is complete

- **GIVEN** any documentation surface mentions `$AddressParse`
- **WHEN** it describes the available methods
- **THEN** it lists `getCityState`, `getCityStateCode`, `parse`, `getStateName`, and `getStateCode`
- **AND** it notes that `getCityState` and `getCityStateCode` are deprecated due to ambiguous city-only lookups

#### Scenario: `AddressParse.getStateName` signature is documented

- **GIVEN** any documentation surface mentions `$AddressParse.getStateName`
- **WHEN** a user reads the description
- **THEN** it shows that `AddressParse.getStateName(code, country)` returns the full state or region name
- **AND** it lists supported country codes (`US`, `GB`, `UK`)
- **AND** it notes that an unknown code returns an empty string

#### Scenario: `AddressParse.getStateCode` signature is documented

- **GIVEN** any documentation surface mentions `$AddressParse.getStateCode`
- **WHEN** a user reads the description
- **THEN** it shows that `AddressParse.getStateCode(name, country)` returns the ISO code for the given state or region name
- **AND** it lists supported country codes (`US`, `GB`, `UK`)
- **AND** it notes that lookup is case-insensitive
- **AND** it notes that an unknown name returns an empty string

#### Scenario: `AddressParse` geo lookup examples are documented

- **GIVEN** any documentation surface mentions `$AddressParse.getStateName` or `$AddressParse.getStateCode`
- **WHEN** a user reads the examples
- **THEN** it includes examples for both US and UK lookups

