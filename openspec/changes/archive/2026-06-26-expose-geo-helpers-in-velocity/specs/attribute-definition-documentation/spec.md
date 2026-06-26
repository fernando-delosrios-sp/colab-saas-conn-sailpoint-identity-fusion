# attribute-definition-documentation Delta Specification

## Purpose

This delta updates the `attribute-definition-documentation` spec so that all user-facing documentation surfaces accurately describe the new geo lookup helpers introduced by the `velocity-geo-helpers` capability.

## ADDED Requirements

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
