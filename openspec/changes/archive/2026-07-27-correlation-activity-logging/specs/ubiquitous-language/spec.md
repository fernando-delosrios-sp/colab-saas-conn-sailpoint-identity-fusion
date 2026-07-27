## ADDED Requirements

### Requirement: Glossary defines correlation activity log terms

The ubiquitous-language glossary SHALL define **Correlation link**, **Correlation merge**, and **Correlated-action grant** as canonical terms for aggregated log counters emitted during account-list operations. **Correlation link** SHALL mean correlation PATCH activity triggered by correlation-on-aggregation (`correlationMode: correlate`) for missing managed accounts. **Correlation merge** SHALL mean correlation PATCH activity triggered by an identity-merge decision (authorized form outcome or automatic merge). **Correlated-action grant** SHALL mean the log counter increment when the connector newly assigns the `correlated` action entitlement to a fusion account because all missing accounts are cleared. These terms SHALL NOT be used as synonyms for blend or reverse correlation.

#### Scenario: Glossary entry for Correlation link

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlation link** entry describing aggregation-time PATCH correlation and its EVENT_SUMMARY / PHASE END counter segment

#### Scenario: Glossary entry for Correlation merge

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlation merge** entry describing merge-decision-driven PATCH correlation distinct from link

#### Scenario: Glossary entry for Correlated-action grant

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlated-action grant** entry describing the log counter for newly assigned correlated action entitlement

---

## MODIFIED Requirements

### Requirement: Glossary distinguishes merge from blend and correlation

The ubiquitous-language spec SHALL state that **Merge** is a Match decision/outcome, **Blend** is the structural absorption of a managed account into a Fusion account, and **Correlation** is the ISC platform operation to link account records. For operational logging, **Correlation link** and **Correlation merge** SHALL identify PATCH correlation subtypes in EVENT_SUMMARY and PHASE END lines. Documentation SHALL NOT use merge as a synonym for blend or correlation.

#### Scenario: Merge versus blend

- **GIVEN** documentation describes a Match outcome joining an existing Fusion identity
- **WHEN** the prose refers to the decision
- **THEN** it SHALL use **merge** (or **manual merge** / **automatic merge**)
- **AND** it SHALL use **blend** only when describing structural managed-account absorption

#### Scenario: Merge is not used as a synonym for correlation PATCH in logs

- **GIVEN** documentation describes EVENT_SUMMARY correlation segments
- **WHEN** an operator reads log format guidance
- **THEN** merge-decision-driven PATCH activity SHALL be labeled **Correlation merge**
- **AND** aggregation-time PATCH activity SHALL be labeled **Correlation link**
