# ubiquitous-language Spec

## ADDED Requirements

### Requirement: Glossary defines Base value

The ubiquitous-language glossary SHALL define **Base value** as the unique-attribute expression rendered with `$counter` empty, after trim, case, spaces, and normalize, then cut so a configured maximum length still has room for the counter.

#### Scenario: Base value entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the text a per-base counter is stored against
- **THEN** a **Base value** entry SHALL define it as the expression rendered with `$counter` empty, after trim, case, spaces, and normalize, then cut to leave room for the counter

### Requirement: Glossary defines Per base value counter

The ubiquitous-language glossary SHALL define **Per base value counter** as an incremental counter stored per base value rather than once for the attribute. The label SHALL be **Per base value counter?** and the key SHALL be `counterPerBase`. The entry SHALL state that the option defaults to off and applies only when **Use incremental counter?** is on. Documentation and configuration SHALL NOT call this a bound counter, a restart counter, or a sequence scope.

#### Scenario: Per base value counter entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the option that counts each base value separately
- **THEN** a **Per base value counter** entry SHALL define it as an incremental counter stored per base value
- **AND** the entry SHALL state that **Per base value counter?** defaults to off and applies only when **Use incremental counter?** is on

### Requirement: Glossary incremental counter entry names the per-base option

The **Incremental counter** glossary entry SHALL state that **Use incremental counter?** keeps one persistent counter for the attribute unless **Per base value counter?** is on.

#### Scenario: Incremental counter entry names the per-base option

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up **Incremental counter**
- **THEN** the entry SHALL state that the attribute has one persistent counter unless **Per base value counter?** is on

### Requirement: Glossary $counter entry distinguishes incremental mode

The **$counter** glossary entry SHALL state that collision-based disambiguation renders `$counter` empty on the first attempt, and that incremental mode renders the next padded number. The entry SHALL state that a conditional expression may omit the counter when it equals zero. The entry SHALL NOT describe `$counter` as empty on the first attempt for incremental mode.

#### Scenario: $counter entry distinguishes incremental mode

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up **$counter**
- **THEN** the entry SHALL state that incremental mode renders the next padded number
- **AND** the entry SHALL state that a conditional expression may omit the counter when it equals zero
