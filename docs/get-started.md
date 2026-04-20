# Get started

This page is the shortest path from “new Fusion source” to a working aggregation. Use the [Map](guides/map.md), [Define](guides/define.md), and [Match](guides/match.md) guides when you need field-level detail.

## Before you begin

- Install the Identity Fusion NG connector package in Identity Security Cloud (ISC) using your organization’s process (for example SailPoint CLI or an internal pipeline).
- Decide whether Fusion must be **authoritative**: required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

## Setup checklist

1. **Create the source** — In Admin → Connections → Sources, create a source with the Identity Fusion NG connector. Set **Authoritative** when you rely on Match for correlation decisions.
2. **Configure connection** — Set the Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
3. **Configure processing** — Set [Source settings](guides/source-configuration.md) (identity scope, managed sources, aggregation behavior), then:
    - **Map:** [Attribute mapping](guides/map.md) (merge strategy and per-attribute mappings).
    - **Define:** [Attribute definitions](guides/define.md) (Velocity, unique IDs, UUIDs, counters).
    - **Match (if used):** [Matching and review](guides/match.md) after sources and baseline are correct.
4. **Discover schema** — Run **Discover Schema** so ISC loads the Fusion account schema.
5. **Aggregation** — Run entitlement aggregation and then account aggregation. If Fusion is **authoritative** and **Match** is configured, also create and attach an identity profile so ISC can build identities from Fusion accounts.

## Where to go next

| Goal | Guide |
| ---- | ----- |
| Source types, filters, correlation modes | [Source configuration](guides/source-configuration.md) |
| Similarity algorithms and tuning | [Matching algorithms](guides/matching-algorithms.md) |
| Queues, retries, batching, logging | [Advanced connection settings](guides/advanced-connection-settings.md) |
| Run logic outside ISC | [Proxy mode](guides/proxy-mode.md) |
| Upgrade from Identity Fusion 1.x | [Migration](guides/migration-from-previous-fusion.md) |
| Validation workflow | [Testing process](guides/testing-process.md) |
| Errors and recovery | [Troubleshooting](guides/troubleshooting.md) |

For connector operations (test connection, account list, and so on), use **Operations** in the site navigation.
