# velocity-geo-helpers Specification

## Purpose

Define the behavior of geo lookup helpers exposed to Apache Velocity attribute-definition expressions in Identity Fusion NG. These helpers let administrators canonicalize US state and UK region identifiers and normalize addresses using the lightweight built-in geo dataset.

## Scope

This spec covers:

- `$Normalize.address(address, country?)`
- `$AddressParse.getStateName(code, country)`
- `$AddressParse.getStateCode(name, country)`

It does **not** cover ambiguous city→state/region inference, which remains deprecated and unsupported.

## ADDED Requirements

### Requirement: `Normalize.address` accepts an optional country parameter

`$Normalize.address` SHALL accept a second, optional `country` argument. When omitted, the helper SHALL behave as it does today (US-centric). When provided, the helper SHALL use the geo dataset for the requested country.

#### Scenario: Default country preserves existing US behavior

- **GIVEN** a Velocity expression `$Normalize.address($address)`
- **AND** `$address` is `"Seattle, WA 98101"`
- **WHEN** the expression is evaluated
- **THEN** the result contains `"Seattle"` and `"WA"`

#### Scenario: US address with full state name is normalized to code

- **GIVEN** a Velocity expression `$Normalize.address($address, "US")`
- **AND** `$address` is `"Los Angeles, California 90001"`
- **WHEN** the expression is evaluated
- **THEN** the result is `"Los Angeles, CA 90001"`

#### Scenario: UK address with region name is normalized to code

- **GIVEN** a Velocity expression `$Normalize.address($address, "GB")`
- **AND** `$address` is `"London, Greater London SW1A 2AA"`
- **WHEN** the expression is evaluated
- **THEN** the result contains `"London"` and `"LND"`

#### Scenario: Unsupported country falls back to trimmed original

- **GIVEN** a Velocity expression `$Normalize.address($address, "CA")`
- **AND** `$address` is `"Toronto, Ontario M5H 2N2"`
- **WHEN** the expression is evaluated
- **THEN** the result is the trimmed original address

#### Scenario: Empty address renders empty

- **GIVEN** a Velocity expression `$Normalize.address($address, "US")`
- **AND** `$address` is `""`
- **WHEN** the expression is evaluated
- **THEN** the result is undefined (rendered as empty)

### Requirement: `AddressParse.getStateName` returns the full name for a code

`$AddressParse.getStateName(code, country)` SHALL return the full state or region name for the given code and country. It SHALL return an empty string when the code is unknown or the country is unsupported.

#### Scenario: US state code resolves to name

- **GIVEN** a Velocity expression `$AddressParse.getStateName("NY", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"New York"`

#### Scenario: UK region code resolves to name

- **GIVEN** a Velocity expression `$AddressParse.getStateName("LND", "GB")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"Greater London"`

#### Scenario: Unknown code returns empty

- **GIVEN** a Velocity expression `$AddressParse.getStateName("ZZ", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `""`

### Requirement: `AddressParse.getStateCode` returns the code for a full name

`$AddressParse.getStateCode(name, country)` SHALL return the ISO code for the given state or region name and country. It SHALL return an empty string when the name is unknown or the country is unsupported.

#### Scenario: US state name resolves to code

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("New York", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"NY"`

#### Scenario: UK region name resolves to code

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("Greater London", "GB")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"LND"`

#### Scenario: Case-insensitive name lookup

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("new york", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"NY"`

#### Scenario: Unknown name returns empty

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("Atlantis", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `""`

### Requirement: `AddressParse.getStateName` and `getStateCode` support UK aliases

Both methods SHALL accept `"UK"` as an alias for `"GB"`.

#### Scenario: UK alias works for code lookup

- **GIVEN** a Velocity expression `$AddressParse.getStateName("LND", "UK")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"Greater London"`

#### Scenario: UK alias works for name lookup

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("Greater London", "UK")`
- **WHEN** the expression is evaluated
- **THEN** the result is `"LND"`

### Requirement: City data is not used for ambiguous city-only inference

Helpers SHALL NOT resolve a city name to a state or region without additional disambiguation. The existing `$AddressParse.getCityState` and `$AddressParse.getCityStateCode` methods remain deprecated.

#### Scenario: Ambiguous city name does not resolve via new helpers

- **GIVEN** a Velocity expression `$AddressParse.getStateCode("Springfield", "US")`
- **WHEN** the expression is evaluated
- **THEN** the result is `""`

## Notes

- All helpers return strings (or render as empty) to match the existing Velocity context contract. Object-returning APIs were considered and rejected because Velocity property access on `undefined` produces unreliable output.
- The supported country codes are explicitly `US`, `GB`, and `UK`. Other values are treated as unsupported and fall back to safe behavior.
