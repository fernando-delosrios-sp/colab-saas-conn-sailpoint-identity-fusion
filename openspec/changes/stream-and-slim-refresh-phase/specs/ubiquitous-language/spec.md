## ADDED Requirements

### Requirement: Glossary defines iterable batching and raw account depletion terms

The ubiquitous-language glossary SHALL define **Iterable Batching** (processing collections directly from an `Iterable<T>` in bounded concurrent batches without allocating an intermediate `T[]` array or accumulating an `R[]` result array) and **Raw Account Depletion** (incrementally deleting raw `Account` instances from the source fetch cache as each corresponding `FusionAccount` is constructed and registered). Documentation and code SHALL NOT refer to raw account depletion as "post-phase cache purge" or "bulk cache flush".

#### Scenario: Iterable Batching entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how collection processing is streamed without array copies
- **THEN** an **Iterable Batching** entry SHALL define it as batch processing directly over an iterator without allocating an array of all items or accumulating an array of all results
- **AND** it SHALL state that completion count is tracked via a scalar counter

#### Scenario: Raw Account Depletion entry

- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how raw accounts are freed during the Refresh phase
- **THEN** a **Raw Account Depletion** entry SHALL define it as deleting raw accounts from the fetch cache incrementally as each `FusionAccount` is registered
- **AND** it SHALL specify that depletion is bypassed when record mode is active
