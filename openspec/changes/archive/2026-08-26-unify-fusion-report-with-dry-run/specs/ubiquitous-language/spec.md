# ubiquitous-language Delta

## ADDED Requirements

### Requirement: Glossary distinguishes report products from Fusion review
The ubiquitous-language glossary SHALL define **dry-run report**, **Fusion report**, **aggregation report**, **Fusion Review decision section**, and **Fusion review** as distinct terms. Documentation, specs, email titles, and entitlement copy SHALL use these terms. **Fusion review** SHALL NOT be called a report.

#### Scenario: Glossary lists the five communication terms
- **WHEN** the glossary is consulted for report or review communications
- **THEN** it SHALL contain **dry-run report**, **Fusion report**, **aggregation report**, **Fusion Review decision section**, and **Fusion review**
- **AND** **Fusion review** SHALL be defined as the reviewer-facing review-required communication (email and review form), not a report

#### Scenario: FusionReport entitlement names the Fusion report
- **WHEN** the action entitlement table is consulted
- **THEN** **FusionReport** (`report`) SHALL be defined as the action that triggers generation of a **Fusion report**
- **AND** it SHALL NOT be defined as triggering an aggregation report

#### Scenario: Agents and docs use the canonical report names
- **WHEN** documentation or new code refers to the HTML/email produced after persistent account-list
- **THEN** the term SHALL be **aggregation report**, not **Fusion report**
