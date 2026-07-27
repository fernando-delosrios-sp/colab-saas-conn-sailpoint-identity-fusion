## ADDED Requirements

### Requirement: Fusion attribute subset omits nullish values from platform output

When `SchemaService.getFusionAttributeSubset` builds the platform-facing attribute bag for ISC account output, it MUST omit any schema-defined attribute whose cast value is `null` or `undefined`. It MUST NOT emit explicit null keys. Attributes with non-nullish cast values (including empty arrays) MUST still be included.

#### Scenario: Unset attribute is omitted from subset

- **GIVEN** a fusion attribute bag where schema attribute `department` is absent or `null`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST NOT contain a `department` key

#### Scenario: Populated attribute is retained

- **GIVEN** a fusion attribute bag where `name` is `"Ada Wong"`
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the returned object MUST contain `name: "Ada Wong"`

#### Scenario: Empty multi-valued array is retained

- **GIVEN** a fusion attribute bag where `reviews` is `[]`
- **WHEN** `getFusionAttributeSubset` is called and `reviews` is schema-defined as multi-valued
- **THEN** the returned object MUST contain `reviews: []`
- **AND** MUST NOT omit the key solely because the array is empty

#### Scenario: Internal bag unchanged

- **GIVEN** a fusion attribute bag with null values for internal mapping
- **WHEN** `getFusionAttributeSubset` is called
- **THEN** the input attribute bag MUST NOT be mutated
- **AND** only the returned subset object reflects omitted keys
