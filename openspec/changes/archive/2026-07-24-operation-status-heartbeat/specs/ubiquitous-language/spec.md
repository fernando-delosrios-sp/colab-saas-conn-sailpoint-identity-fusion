## ADDED Requirements

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging.

#### Scenario: Glossary entry for Operation heartbeat

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations

#### Scenario: Glossary entry for STATUS line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational text line (phase, step, progress, queue, memory, elapsed)

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks
