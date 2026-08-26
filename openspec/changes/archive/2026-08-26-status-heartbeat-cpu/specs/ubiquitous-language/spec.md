## ADDED Requirements

### Requirement: Glossary defines STATUS CPU segment

The ubiquitous-language glossary SHALL define **STATUS CPU segment** as the `cpu={percent}%` token on a **STATUS line**: integer percent of one core for the connector process over the sample window (`process.cpuUsage` user+system versus wall time). It SHALL NOT mean host load average, container CPU quota, or CPU-seconds.

#### Scenario: Glossary entry for STATUS CPU segment

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **STATUS CPU segment** entry
- **AND** the entry SHALL state that the token is `cpu={percent}%` on a STATUS line
- **AND** the entry SHALL NOT define the term as host load average or container quota

---

## MODIFIED Requirements

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging. The **STATUS line** entry SHALL include process CPU (`cpu=`) alongside phase, step, progress, queue, memory, and elapsed.

#### Scenario: Glossary entry for Operation heartbeat

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations

#### Scenario: Glossary entry for STATUS line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational text line (phase, step, progress, queue, memory, CPU, elapsed)

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks
