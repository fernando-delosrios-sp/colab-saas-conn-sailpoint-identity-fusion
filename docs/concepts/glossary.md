# Identity Fusion NG glossary

This page defines the canonical terms used throughout the connector, its configuration, and its documentation.

## Accounts

### ISC account

Any account object from Identity Security Cloud.

### Managed source account

An ISC account from one of the sources configured under **Source Settings → Sources**. The connector fetches these accounts and merges their attributes into Fusion accounts.

### Managed account key

The composite identifier `sourceId::nativeIdentity` that uniquely identifies a managed source account within ISC.

### Fusion account

The consolidated ISC account produced by the **Map** and **Define** steps.

### Fusion identity

A Fusion account that has been correlated to an ISC identity and is treated as that identity's authoritative account.

### Identity-origin Fusion account

A Fusion account seeded from an existing ISC identity during aggregation (for example when **Include identities in the scope?** is enabled), rather than from a managed source account.

### Provisional Fusion account

A Fusion account created from a managed source account before its match fate has been decided.

## Operation structure

### Operation

A connector entry point such as `std:account:list` (the **accountList operation**) or `custom:dryrun` (the **dryRun operation**). The operation is the command definition.

### Operation run

A single execution or instance of an operation. A run is the execution of an operation.

### Phase

A major stage of an operation pipeline (for example the identity documents phase, the Fusion accounts phase, the managed accounts phase, or the report phase).

### Sweep

A traversal of a set of accounts with a single purpose within a phase.

### Correlated account sweep

A sweep that processes already-correlated managed source accounts before the main matching sweeps begin, so their outcomes are visible as candidates for uncorrelated accounts.

### Aggregation

The ISC source-refresh operation. Use **managed source aggregation** or **Fusion source aggregation** when the source matters.

### Map

Merging attributes from one or more managed source accounts into a single Fusion account schema.

### Define

Computing new attributes (normal attributes) and generating persistent unique attributes (UUIDs, counters, disambiguated values) using Apache Velocity templates.

### Match

The product step that determines whether a Fusion account corresponds to an existing identity, using scoring and optional automatic assignment or manual review.

<!-- markdownlint-disable MD024 -->

## Matching

### Matching

The business process of determining whether a new Fusion account is potentially part of an existing identity.

### Scoring

The similarity-calculation method used by matching to compare attribute values.

<!-- markdownlint-enable MD024 -->

### Combined match score

The weighted mean of evaluated rule similarities used to decide whether a candidate is a potential match.

### Potential match

A candidate whose combined match score meets or exceeds the configured threshold and whose mandatory rules pass.

### Automatic assignment

The decision to link a matched Fusion account to a specific identity without manual review when the combined score meets the automatic assignment threshold.

## Candidates

### Identity candidate

A candidate for matching that is an existing ISC identity (or a Fusion identity already in the baseline).

### Deferred candidate

A candidate for matching that is another provisional Fusion account from the same source in the same operation run, causing identity creation to be deferred until the next aggregation.

## Source types

### Authoritative accounts

Managed source accounts that create new ISC identities when they do not match an existing identity. Fusion typically owns correlation decisions for these sources.

### Records

Managed source accounts that run **Map** and **Define** and may register unique attributes, but do not create Fusion accounts for non-matched rows.

### Orphan accounts

Managed source accounts whose non-matched rows are dropped; optionally, stale orphan accounts can be disabled.

## Processing states

### Baseline

An existing identity that is included in the identity scope and used as a comparison point during the **Match** step.

### Uncorrelated

A Fusion account or managed source account that is not yet linked to a known identity.

### Non-matched / `nonMatched`

A managed source account that completed the **Match** step without finding any acceptable identity candidate. The status entitlement value is `nonMatched`; the matching status string is `non-matched`.

### Orphan

A Fusion account that no longer has any contributing managed source accounts. Depending on configuration, orphan accounts may be removed or disabled.

### Deferred

A match result where the best candidate is a deferred candidate from the same source in the same operation run. The connector defers creating a new identity until a later aggregation can compare against the established baseline.

## Services

| Term | Definition |
|------|------------|
| **FusionRun** | The centralized state object for a single operation run. Holds all data loaded during the run and serves as the single source of truth for stateless services. Supports `snapshot()` and `restore()` for recording and deterministic replay. |
