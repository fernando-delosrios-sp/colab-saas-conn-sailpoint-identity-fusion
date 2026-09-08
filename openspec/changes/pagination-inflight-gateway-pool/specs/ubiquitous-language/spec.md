## MODIFIED Requirements

### Requirement: Glossary defines pagination circuit terms

The ubiquitous-language glossary SHALL define **Gateway failure** as an HTTP 504 or request timeout (`ECONNABORTED` / `ETIMEDOUT`) on a page fetch, distinct from HTTP 429 and from other 5xx. It SHALL define **Gateway-failure pool** as the set of page fetches on one pagination stream that have observed a gateway failure and have not yet returned success. It SHALL define **Pagination circuit** as per-pagination-stream state that sheds load when the gateway-failure pool reaches `min(10, window)` and fails the call — not a tenant-wide or whole-queue breaker, and not consecutive-streak cooldown-then-probe. The glossary MUST NOT define **Cooldown** or **Probe** as current pagination-circuit behavior.

#### Scenario: Glossary entry for Gateway failure

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Gateway failure** entry
- **AND** the entry SHALL exclude HTTP 429 from that term

#### Scenario: Glossary entry for Gateway-failure pool

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Gateway-failure pool** entry
- **AND** the entry SHALL state that a page leaves the pool only when that page returns success

#### Scenario: Glossary entry for Pagination circuit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Pagination circuit** entry
- **AND** the entry SHALL state that the circuit is per pagination stream and is not a global API kill switch
- **AND** the entry SHALL describe pool-then-shed, not cooldown-then-probe

#### Scenario: Glossary does not keep Cooldown as current circuit behavior

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL NOT describe **Cooldown** as a current pagination-circuit wait after shed

#### Scenario: Glossary does not keep Probe as current circuit behavior

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL NOT describe **Probe** as a current pagination-circuit page after cooldown

#### Scenario: Glossary entry for Cooldown

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL NOT describe **Cooldown** as a current pagination-circuit wait after shed

#### Scenario: Glossary entry for Probe

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL NOT describe **Probe** as a current pagination-circuit page after cooldown
