# Identity Fusion NG glossary

This page defines the canonical terms used throughout the connector, its configuration, and its documentation.

## Accounts

### Fusion account

The connector’s consolidated ISC account. It is produced by the **Map** and **Define** steps and may then be scored in the **Match** step.

### Fusion identity

A **Fusion account that became an identity** in Identity Security Cloud. Once a Fusion account is the authoritative account for an identity, it is useful to distinguish it as a Fusion identity.

### Identity-based Fusion account

A **Fusion account whose origin is an identity**. These accounts are seeded from an existing ISC identity during aggregation (for example when **Include identities in the scope?** is enabled) rather than from a managed source account.

### Managed account / managed source account

An account from one of the sources configured under **Source Settings → Sources**. The connector fetches these accounts from ISC and merges their attributes into Fusion accounts.

### Managed account key

The composite identifier `sourceId::nativeIdentity` that uniquely identifies a managed account within ISC.

## Processing states

### Baseline

An existing identity that is included in the identity scope and used as a comparison point during the **Match** step.

### Uncorrelated

A Fusion account or managed account that is not yet linked to a known identity. Uncorrelated managed accounts are the primary input to the **Match** step.

### Non-matched / `nonMatched`

A managed account that completed the **Match** step without finding any acceptable identity candidate. The status entitlement value is `nonMatched`; the matching status string is `non-matched`.

### Orphan

A Fusion account that no longer has any contributing managed source accounts. Depending on configuration, orphan accounts may be removed or disabled.

### Deferred

A match result where the best candidate is another new unmatched account from the same source in the same aggregation run. The connector defers creating a new identity until a later aggregation can compare against the established baseline.

## Framework steps

### Map

Merging attributes from one or more managed source accounts into a single Fusion account schema.

### Define

Computing new attributes (normal attributes) and generating persistent unique attributes (UUIDs, counters, disambiguated values) using Apache Velocity templates.

### Match

Scoring Fusion accounts against the identity baseline using similarity algorithms, optional automatic assignment, and optional manual review workflows.

## Source types

### Authoritative accounts

Managed source accounts that create new ISC identities when they do not match an existing identity. Fusion typically owns correlation decisions for these sources.

### Records

Managed source accounts that run **Map** and **Define** and may register unique attributes, but do not create Fusion accounts for unmatched rows.

### Orphan accounts

Managed source accounts whose unmatched rows are dropped; optionally, stale orphan accounts can be disabled.

## Correlation, matching, and assignment

### Correlation

Linking a managed source account to an existing ISC identity (or to a Fusion identity) so that ISC treats them as the same person.

### Matching

The similarity scoring that determines whether a Fusion account likely corresponds to an existing identity.

### Assignment

The decision that links a matched Fusion account or managed account to a specific identity, either automatically or through a manual review form.

### Deferred matching

A per-source option for **Authoritative accounts**. When enabled, unmatched accounts are also compared against other new unmatched accounts from the same source in the same aggregation run. If the strongest match is such a peer, identity creation is deferred until the next aggregation, when that peer is part of the baseline.
