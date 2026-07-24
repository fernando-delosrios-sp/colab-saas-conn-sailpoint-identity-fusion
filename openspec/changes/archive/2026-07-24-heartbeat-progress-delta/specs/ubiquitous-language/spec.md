## MODIFIED Requirements

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, **Pipeline progress delta**, **API queue completed delta**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging. The **Operation heartbeat** entry SHALL state the default interval is 10 seconds (configurable via **Heartbeat interval** in Advanced Connection Settings). The **STATUS line** entry SHALL explain that pipeline progress and api-queue completion are separate counters with independent deltas.

#### Scenario: Glossary entry for Operation heartbeat

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up periodic operation visibility
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations with a default interval of 10 seconds

#### Scenario: Glossary entry for STATUS line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up situational heartbeat text
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational heartbeat text line (grep prefix `STATUS`) including pipeline `progress=` and `api-queue completed=` segments

#### Scenario: Glossary entry for pipeline progress delta

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up heartbeat throughput metrics
- **THEN** it SHALL contain a **Pipeline progress delta** entry describing the change in enumerable pipeline work (`progress.done`) since the previous STATUS tick

#### Scenario: Glossary entry for API queue completed delta

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up heartbeat throughput metrics
- **THEN** it SHALL contain an **API queue completed delta** entry describing the change in HTTP requests completed through ApiQueue since the previous STATUS tick, distinct from pipeline progress

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up aggregated account activity logging
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks

## ADDED Requirements

### Requirement: Glossary table includes heartbeat delta terms

The canonical glossary table under Operations, phases, and sweeps SHALL include rows for **Pipeline progress delta** and **API queue completed delta** with definitions that distinguish enumerable pipeline work from ApiQueue HTTP completions.

#### Scenario: Delta terms appear in operations glossary table

- **GIVEN** a reader consults the Operations, phases, and sweeps glossary table
- **WHEN** they search for heartbeat delta vocabulary
- **THEN** rows for **Pipeline progress delta** and **API queue completed delta** SHALL be present
