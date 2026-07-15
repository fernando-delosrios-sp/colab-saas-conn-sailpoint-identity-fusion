## ADDED Requirements

### Requirement: `$Normalize.ascii` is exposed in the Normalize Velocity context

The `Normalize` Velocity context object exposed by the attribute service SHALL include an `ascii` method that wraps the `normalizeAscii` function with the standard `withNormalizeFallback` error handling.

#### Scenario: Normalize.ascii is callable from Velocity templates

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "de")`
- **THEN** the helper SHALL be available and return the transliterated result

#### Scenario: Normalize.ascii returns empty string on error

- **WHEN** the `normalizeAscii` implementation throws an unexpected error
- **THEN** `withNormalizeFallback` SHALL log the error and return an empty string
- **AND** the template SHALL render nothing (empty string → undefined)

#### Scenario: Normalize.ascii logs and returns empty on undefined result

- **WHEN** the `normalizeAscii` implementation returns undefined (e.g., for empty input)
- **THEN** `withNormalizeFallback` SHALL log a debug message and return an empty string
- **AND** the template SHALL render nothing (empty string → undefined)

### Requirement: `$Normalize.ascii` transliterates non-ASCII characters to ASCII

The connector SHALL expose a `$Normalize.ascii(input, language?)` Velocity helper that converts non-ASCII characters to their ASCII equivalents. When no language is provided, or the language is not recognized, the helper SHALL use the `transliteration` library as a fallback. When a recognized language code is provided, the helper SHALL apply language-specific digraph replacement rules.

#### Scenario: No language falls back to transliteration library

- **WHEN** a Velocity template evaluates `$Normalize.ascii("José")`
- **THEN** the result SHALL be `"jose"`

#### Scenario: Empty or whitespace-only input returns undefined

- **WHEN** a Velocity template evaluates `$Normalize.ascii("")`
- **THEN** the result SHALL be undefined, rendered as empty

#### Scenario: Unknown language code falls back to transliteration

- **WHEN** a Velocity template evaluates `$Normalize.ascii("José", "xyz")`
- **THEN** the result SHALL be `"jose"`

#### Scenario: Pure ASCII input is unchanged

- **WHEN** a Velocity template evaluates `$Normalize.ascii("hello")`
- **THEN** the result SHALL be `"hello"`

### Requirement: German language code applies DACH digraph rules

When the language parameter resolves to `de`, the helper SHALL replace German-specific characters with their digraph equivalents: `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`.

#### Scenario: German umlauts are converted to digraphs

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "de")`
- **THEN** the result SHALL be `"mueller"`

#### Scenario: German sharp s is converted

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Straße", "de")`
- **THEN** the result SHALL be `"strasse"`

#### Scenario: Multiple German characters in one string

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Günther Müller", "de")`
- **THEN** the result SHALL be `"guenther mueller"`

### Requirement: Nordic language codes apply Nordic digraph rules

When the language parameter resolves to `no`, `da`, or `sv`, the helper SHALL replace Nordic-specific characters with their digraph equivalents: `ä→ae`, `ö→oe`, `å→aa`, `ø→oe`.

#### Scenario: Norwegian characters are converted to digraphs

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Søren Østergaard", "no")`
- **THEN** the result SHALL be `"soeren oestergaard"`

#### Scenario: Danish characters are converted to digraphs

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Jørgen Ågaard", "da")`
- **THEN** the result SHALL be `"joergen aagaard"`

#### Scenario: Swedish characters are converted to digraphs

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Sören Åström", "sv")`
- **THEN** the result SHALL be `"soeren aastroem"`

### Requirement: Language codes are resolved hierarchically

When a language code contains a hyphen (e.g., `de-DE`), the helper SHALL first attempt an exact match. If no exact match exists, it SHALL strip the suffix after the hyphen and attempt to match the prefix.

#### Scenario: Locale variant resolves to base language

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "de-DE")`
- **THEN** the result SHALL be `"mueller"` (DACH rules via `de` fallback)

#### Scenario: Multiple locale variants resolve to same rule set

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "de-AT")`
- **AND** a template evaluates `$Normalize.ascii("Müller", "de-CH")`
- **THEN** both SHALL return `"mueller"`

### Requirement: Language code matching is case-insensitive

The helper SHALL treat language codes case-insensitively. `"DE"`, `"De"`, and `"de"` SHALL all resolve to the DACH rule set.

#### Scenario: Uppercase language code resolves correctly

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "DE")`
- **THEN** the result SHALL be `"mueller"`

#### Scenario: Mixed case language code resolves correctly

- **WHEN** a Velocity template evaluates `$Normalize.ascii("Müller", "dE")`
- **THEN** the result SHALL be `"mueller"`

### Requirement: Output is always lowercase

The helper SHALL always return lowercase ASCII output, regardless of input casing. This ensures predictable chaining with `$Normalize.name()` for proper-casing.

#### Scenario: Uppercase input produces lowercase output

- **WHEN** a Velocity template evaluates `$Normalize.ascii("MÜLLER", "de")`
- **THEN** the result SHALL be `"mueller"`

#### Scenario: Mixed case input produces lowercase output

- **WHEN** a Velocity template evaluates `$Normalize.ascii("MüLlEr", "de")`
- **THEN** the result SHALL be `"mueller"`

### Requirement: Helper chains correctly with `$Normalize.name` and `$Normalize.fullName`

The helper SHALL be chainable with other Velocity helpers to produce properly-cased ASCII names.

#### Scenario: Chained with Normalize.name produces proper-cased DACH name

- **WHEN** a Velocity template evaluates `$Normalize.name($Normalize.ascii("MÜLLER", "de"))`
- **THEN** the result SHALL be `"Mueller"`

#### Scenario: Chained with Normalize.fullName produces proper-cased DACH full name

- **WHEN** a Velocity template evaluates `$Normalize.fullName($Normalize.ascii("GÜNTHER MÜLLER", "de"))`
- **THEN** the result SHALL be `"Guenther Mueller"`
