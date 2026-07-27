## ADDED Requirements

### Requirement: Glossary defines DETAIL line

The ubiquitous-language glossary SHALL define **DETAIL line** as a structured INFO log kind (grep prefix `DETAIL`) for operational milestones between heartbeat ticks, using space-separated `key=value` pairs. DETAIL lines during operations SHALL be prefixed with `[operationContext]`; during config bootstrap they SHALL be prefixed with `[config]`.

#### Scenario: Glossary entry for DETAIL line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up operational milestone logging
- **THEN** it SHALL contain a **DETAIL line** entry describing the structured key=value format and context prefixes

---

## MODIFIED Requirements

### Requirement: The report step is the Epilogue, not a phase

The term **Epilogue** SHALL denote the terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of whether the pipeline succeeded or failed. The report step SHALL NOT be called a phase. Code, log labels, and documentation SHALL use structured `EPILOGUE {block} START` and `EPILOGUE {block} END elapsed=` lines (grep prefix `EPILOGUE`) instead of `PHASE 6`, `PHASE 7`, or colon-style `Epilogue: …` labels. The **Epilogue** domain term and `Report` short label in internal phase-timing breakdowns SHALL be preserved unchanged.

#### Scenario: Log labels use Epilogue terminology

- **WHEN** the account-list operation logs the report step
- **THEN** the label SHALL read `EPILOGUE report START` at entry and `EPILOGUE report END elapsed=` at completion
- **AND** the label SHALL NOT use a phase number or colon-style `Epilogue: report generation`

#### Scenario: Code naming follows the Epilogue term

- **WHEN** code refers to the terminal report block of the account-list pipeline
- **THEN** identifiers SHALL use canonical terms (for example `reportEpilogue`, `ReportEpilogueOptions`), consistent with the **Epilogue** glossary entry

#### Scenario: Glossary defines Epilogue alongside Phase

- **WHEN** the "Operations, phases, and sweeps" glossary table is consulted
- **THEN** it SHALL contain an **Epilogue** entry defined as the always-runs terminal report block

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, **Pipeline progress delta**, **API queue completed delta**, **DETAIL line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging. The **Operation heartbeat** entry SHALL state the default interval is 10 seconds (configurable via **Heartbeat interval** in Advanced Connection Settings). The **STATUS line** entry SHALL explain that pipeline progress and api-queue completion are separate counters with independent deltas. The **STATUS line** entry SHALL describe the compact api segment format `api=Na/Nq/Nc`.

#### Scenario: Glossary entry for Operation heartbeat

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up periodic operation visibility
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations with a default interval of 10 seconds

#### Scenario: Glossary entry for STATUS line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up situational heartbeat text
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational heartbeat text line (grep prefix `STATUS`) including pipeline `progress=` and compact `api=Na/Nq/Nc` segments

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

---

## REMOVED Requirements

_(none)_
