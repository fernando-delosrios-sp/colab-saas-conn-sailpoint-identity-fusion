## ADDED Requirements

### Requirement: Glossary defines Heartbeat interval

The ubiquitous-language glossary SHALL define **Heartbeat interval** as the canonical term for the Advanced Connection Settings field that controls how often the operation heartbeat emits STATUS and EVENT_SUMMARY lines.

#### Scenario: Glossary entry for Heartbeat interval

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they search for heartbeat configuration terms
- **THEN** it SHALL contain a **Heartbeat interval** entry describing the seconds-based Advanced Connection Settings field and its relationship to `statsLoggingIntervalMs`

## MODIFIED Requirements

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging. The **Operation heartbeat** entry SHALL state the default interval is 10 seconds (configurable via **Heartbeat interval** in Advanced Connection Settings).

#### Scenario: Glossary entry for Operation heartbeat

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they search for operation visibility terms
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations with a default interval of 10 seconds

#### Scenario: Glossary entry for STATUS line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they search for operation visibility terms
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational heartbeat text line (grep prefix `STATUS`)

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they search for operation visibility terms
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks
