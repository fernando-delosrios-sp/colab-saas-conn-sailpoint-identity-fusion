# ubiquitous-language Delta

## ADDED Requirements

### Requirement: The report step is the Epilogue, not a phase
The term **Epilogue** SHALL denote the terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of whether the pipeline succeeded or failed. The report step SHALL NOT be called a phase. Code, log labels, and documentation SHALL use "Epilogue" (for example `Epilogue: report generation`) instead of "PHASE 6" or "PHASE 7". The `Report` short label in phase-timing rows SHALL be preserved unchanged.

#### Scenario: Log labels use Epilogue terminology
- **WHEN** the account-list operation logs the report step
- **THEN** the label SHALL read "Epilogue: …" and SHALL NOT use a phase number

#### Scenario: Code naming follows the Epilogue term
- **WHEN** code refers to the terminal report block of the account-list pipeline
- **THEN** identifiers SHALL use canonical terms (for example `reportEpilogue`, `ReportEpilogueOptions`), consistent with the **Epilogue** glossary entry

#### Scenario: Glossary defines Epilogue alongside Phase
- **WHEN** the "Operations, phases, and sweeps" glossary table is consulted
- **THEN** it SHALL contain an **Epilogue** entry defined as the always-runs terminal report block
- **AND** the **Phase** entry SHALL NOT list the report step as an example phase
