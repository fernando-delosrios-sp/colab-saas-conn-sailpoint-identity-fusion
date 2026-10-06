## ADDED Requirements

### Requirement: Fusion attribute subset omits empty values from platform output

When `SchemaService.getFusionAttributeSubset` builds the platform-facing attribute bag for ISC account output, it MUST omit any schema-defined attribute whose cast value is `null` or `undefined`. It MUST NOT emit explicit null keys. It MUST omit a schema attribute whose emitted value is a blank string (`""` or whitespace-only) or an empty array. For a multi-valued attribute it MUST remove blank string elements first and MUST omit the attribute when no elements remain. It MUST still emit a multi-valued attribute that has at least one non-blank element, without its blank string elements. It MUST emit the attributes named `id` and `name` when their emitted value is a blank string. It MUST still include boolean `false`, numeric `0`, and any other emitted value that is not a blank string or an empty array. A blank string cast to `0` or `false` by the existing numeric or boolean cast MUST be included as that cast result. Emptiness MUST be judged with `trim` and MUST NOT rewrite a non-blank string. The input attribute bag MUST NOT be mutated.

#### Scenario: Unset attribute is omitted from subset

- **GIVEN** a fusion attribute bag where schema attribute `department` is absent or `null`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `department` key

#### Scenario: Populated attribute is retained

- **GIVEN** a fusion attribute bag where `name` is `"Ada Wong"`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `name: "Ada Wong"`

#### Scenario: Blank string is omitted

- **GIVEN** a fusion attribute bag where schema attribute `department` is `""`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `department` key

#### Scenario: Whitespace-only string is omitted

- **GIVEN** a fusion attribute bag where schema attribute `department` is `"   "`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `department` key

#### Scenario: Surrounding whitespace on a non-blank string is preserved

- **GIVEN** a fusion attribute bag where schema attribute `department` is `"  Finance  "`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `department: "  Finance  "`

#### Scenario: Empty multi-valued array is omitted

- **GIVEN** a fusion attribute bag where `reviews` is `[]`
- **AND** `reviews` is schema-defined as multi-valued
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `reviews` key

#### Scenario: Multi-valued array of only blank strings is omitted

- **GIVEN** a fusion attribute bag where `reviews` is `["", "  "]`
- **AND** `reviews` is schema-defined as multi-valued
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `reviews` key

#### Scenario: Mixed multi-valued array drops blank elements

- **GIVEN** a fusion attribute bag where `reviews` is `["ok", "", "  "]`
- **AND** `reviews` is schema-defined as multi-valued
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `reviews: ["ok"]`

#### Scenario: Boolean false is retained

- **GIVEN** a fusion attribute bag where `active` is `false`
- **AND** `active` is schema-defined as boolean
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `active: false`

#### Scenario: Numeric zero is retained

- **GIVEN** a fusion attribute bag where `employeeNumber` is `0`
- **AND** `employeeNumber` is schema-defined as int
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `employeeNumber: 0`

#### Scenario: Blank string on a numeric attribute is emitted as zero

- **GIVEN** a fusion attribute bag where `employeeNumber` is `""`
- **AND** `employeeNumber` is schema-defined as int
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `employeeNumber: 0`

#### Scenario: Blank string on a boolean attribute is emitted as false

- **GIVEN** a fusion attribute bag where `active` is `""`
- **AND** `active` is schema-defined as boolean
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `active: false`

#### Scenario: Blank identity attribute is retained

- **GIVEN** a fusion attribute bag where `id` is `""`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `id: ""`

#### Scenario: Whitespace-only display attribute is retained

- **GIVEN** a fusion attribute bag where `name` is `"   "`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `name: "   "`

#### Scenario: Null identity attribute is omitted

- **GIVEN** a fusion attribute bag where `id` is `null`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain an `id` key

#### Scenario: Blank required attribute other than id or name is omitted

- **GIVEN** a fusion attribute bag where `employeeId` is `""`
- **AND** `employeeId` is schema-defined as a required string
- **AND** `employeeId` is not `id` or `name`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain an `employeeId` key

#### Scenario: String zero is retained

- **GIVEN** a fusion attribute bag where schema attribute `department` is `"0"`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `department: "0"`

#### Scenario: Internal bag unchanged

- **GIVEN** a fusion attribute bag with `department` set to `null` and `reviews` set to `[]`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the input attribute bag MUST NOT be mutated
- **AND** `reviews` on the input MUST still be `[]`
- **AND** only the returned subset object reflects omitted keys

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

### Requirement: Fusion attribute subset omits nullish values from platform output

**Reason**: That requirement kept empty arrays. Platform output now also omits blank strings and empty arrays. The replacement requirement still omits `null` and `undefined`.

**Migration**: Use **Fusion attribute subset omits empty values from platform output** in this change. Callers that expected `reviews: []` on the ISC account payload should expect the key to be absent.

---

## RENAMED Requirements

_(none)_
