# First aggregation

This page is the shortest path from a new Fusion source to a working aggregation. For prerequisites and operation mode context, read [Overview](overview.md) first.

Use the [Use guides](../use-guides/index.md) when you need scenario-driven detail, and the [Configuration reference](../configuration/index.md) for field-level settings.

## Before you begin

- Install the Identity Fusion NG connector package in Identity Security Cloud (ISC) using your organization's process (for example SailPoint CLI or an internal pipeline).
- Decide whether Fusion must be **authoritative**: required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

## Setup checklist

1. **Create the source** — In Admin → Connections → Sources, create a source with the Identity Fusion NG connector. Set **Authoritative** when you rely on Match for correlation decisions.
2. **Configure connection** — Set the Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
3. **Configure processing** — Set [Source settings](../use-guides/configuration/configuring-sources.md) (identity scope, managed sources, aggregation behavior), then:
    - **Map:** [Mapping attributes](../use-guides/configuration/mapping-attributes.md) (merge strategy and per-attribute mappings).
    - **Define:** [Defining attributes](../use-guides/configuration/defining-attributes.md) (Velocity, unique IDs, UUIDs, counters).
    - **Match (if used):** [Matching identities](../use-guides/configuration/matching-identities.md) and [Review forms and reviewers](../use-guides/configuration/review-forms-and-reviewers.md) after sources and baseline are correct.
4. **Discover schema** — Run **Discover Schema** so ISC loads the Fusion account schema.
5. **Identity profile and aggregation** — Attach an identity profile and provisioning plan as required, then run entitlement and account aggregation.

## Where to go next

| Goal | Guide |
| --- | --- |
| Source types, filters, correlation modes | [Configuring sources](../use-guides/configuration/configuring-sources.md) |
| Similarity algorithms and tuning | [Tuning matching algorithms](../use-guides/configuration/tuning-matching-algorithms.md) |
| Queues, retries, batching, logging | [Connection and observability tuning](../use-guides/operation/connection-and-observability-tuning.md) |
| Run logic outside ISC | [Proxy deployment](../reference/proxy-mode.md) |
| Upgrade from Identity Fusion 1.x | [Migrating from Identity Fusion v1](../use-guides/deployment/migrating-from-identity-fusion-v1.md) |
| Validation workflow | [Testing and validation](../use-guides/validation-and-troubleshooting/testing-and-validation.md) |
| Errors and recovery | [Troubleshooting](../use-guides/validation-and-troubleshooting/troubleshooting.md) |

For connector operations (test connection, account list, and so on), use **Technical reference → Connector operations** in the site navigation.
