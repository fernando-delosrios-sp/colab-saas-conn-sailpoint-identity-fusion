## ADDED Requirements

### Requirement: Glossary defines pagination circuit terms

The ubiquitous-language glossary SHALL define **Gateway failure** as an HTTP 504 or request timeout (`ECONNABORTED` / `ETIMEDOUT`) on a page fetch, distinct from HTTP 429 and from other 5xx. It SHALL define **Pagination circuit** as per-pagination-stream state that sheds load after consecutive gateway failures, then resumes after a successful probe or fails the call — not a tenant-wide or whole-queue breaker. It SHALL define **Cooldown** as a bounded wait after shed with no new page starts on that stream, distinct from per-request retry backoff. It SHALL define **Probe** as a single page request after cooldown used to decide resume versus abort.

#### Scenario: Glossary entry for Gateway failure

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Gateway failure** entry
- **AND** the entry SHALL exclude HTTP 429 from that term

#### Scenario: Glossary entry for Pagination circuit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Pagination circuit** entry
- **AND** the entry SHALL state that the circuit is per pagination stream and is not a global API kill switch

#### Scenario: Glossary entry for Cooldown

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Cooldown** entry
- **AND** the entry SHALL distinguish cooldown from per-request retry backoff

#### Scenario: Glossary entry for Probe

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Probe** entry describing a single page request after cooldown
