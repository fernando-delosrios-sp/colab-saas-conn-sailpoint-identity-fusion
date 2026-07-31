# Use guides

Scenario-based guides for configuring, operating, validating, and deploying Identity Fusion NG. Start here for prerequisites, your first aggregation, and an index of every guide.

Each guide walks through real setup patterns and tuning recipes. For exact field keys, types, defaults, and allowed values, use the linked [Configuration reference](../configuration/index.md) page.

## Prerequisites

Before you configure Identity Fusion NG in ISC:

- Install the Identity Fusion NG connector package using your organization's process (for example SailPoint CLI or an internal pipeline).
- Create a dedicated ISC identity and [Personal Access Token](https://documentation.sailpoint.com/saas/help/common/pat.html) with the scopes listed in [ISC PAT scopes](../reference/pat-scopes.md). The minimal set covers sources, accounts, search, forms, workflows, and identity profiles; conditional scopes apply when Match, reverse correlation, or aggregation control is enabled.
- Decide which Map, Define, and Match stages you need. You can use them independently or together, but the connector always evaluates configured steps in Map → Define → Match order.
- Decide whether the Fusion source must be **authoritative** in ISC. Authoritative is required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

## First aggregation checklist

The shortest path from a new Fusion source to a working aggregation:

1. **Create the source** — In Admin → Connections → Sources, create a source with the Identity Fusion NG connector. Set **Authoritative** when you rely on Match for correlation decisions.
2. **Configure connection** — Set the Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
3. **Configure processing** — Set [Configuring sources](configuration/configuring-sources.md) (identity scope, managed sources, aggregation behavior), then:
    - **Map:** [Mapping attributes](configuration/mapping-attributes.md) (merge strategy and per-attribute mappings).
    - **Define:** [Defining attributes](configuration/defining-attributes.md) (Velocity, unique IDs, UUIDs, counters).
    - **Match (if used):** [Matching identities](configuration/matching-identities.md), [Managing correlation](configuration/managing-correlation.md), and [Managing reviewers](configuration/managing-reviewers.md) after sources and baseline are correct.
4. **Discover schema** — Run **Discover Schema** so ISC loads the Fusion account schema.
5. **Identity profile and aggregation** — Attach an identity profile and provisioning plan as required, then run entitlement and account aggregation.

## Operation modes

Each managed source in **Source Settings** has a **Source type** that controls how its accounts are processed:

| Mode | Behavior | Typical use |
| --- | --- | --- |
| **Authoritative accounts** (default) | Full Map, Define, and Match; non-matched rows can create identities when Fusion is authoritative | Fusion owns correlation decisions for that source |
| **Records** | Map and Define run; unique values register without emitting Fusion accounts for non-matched rows | Identifier generation without new identities |
| **Orphan accounts** | Non-matched rows are dropped (optional disable on managed source) | Supplemental data for Match only |

**Records sources:** **Include record accounts in Match** (default on) controls whether record accounts participate in Match scoring. When off, a bulk **record unique registration** step runs instead of full Match processing.

**Orphan sources:** **Disable non-matching accounts** optionally triggers a background disable for stale orphans lacking a match.

See [Configuring sources](configuration/configuring-sources.md) for filters, aggregation timing, and per-source options.

## Deployment patterns

| Goal | Typical authority | Managed sources |
| --- | --- | --- |
| **Match** (correlation and deduplication) | Fusion source is **authoritative** | One or more authoritative account sources |
| **Map and Define only** (unique IDs, consolidated attributes) | Fusion is often **not** authoritative | Optional; depends on your Map requirements |
| **Records** (register unique values without new identities) | Usually non-authoritative | Records-type sources |
| **Orphan** (match-only supplemental data) | Usually non-authoritative | Orphan-type sources |

The connector can run side by side with other ISC sources. When Fusion is authoritative for Match, it determines which incoming managed accounts create a new identity and which correlate to an existing one.

## Configuration guides

| Guide | Description |
| ----- | ----------- |
| [Mapping attributes](configuration/mapping-attributes.md) | Attribute mapping, merging, and consolidation from multiple sources. |
| [Defining attributes](configuration/defining-attributes.md) | Attribute definitions (Velocity computed attributes, unique identifiers, UUIDs, counters). |
| [Matching identities](configuration/matching-identities.md) | Detect and resolve potential matching identities using one or more sources. |
| [Managing correlation](configuration/managing-correlation.md) | Correlation modes, reverse correlation, enforced correlation roles, and when to use each. |
| [Managing reviewers](configuration/managing-reviewers.md) | Reviewer access profiles, global vs per-source assignment, and review workload. |
| [Review forms and reviewers](configuration/review-forms-and-reviewers.md) | Review form fields, expiration, automatic merge, and end-to-end Match flow. |
| [Tuning matching algorithms](configuration/tuning-matching-algorithms.md) | Algorithms, thresholds, and how scores combine. |
| [Configuring sources](configuration/configuring-sources.md) | Source settings, scope, aggregation timing, and source types. |

## Operation guides

| Guide | Description |
| ----- | ----------- |
| [Connection and observability tuning](operation/connection-and-observability-tuning.md) | Queue, retry, timeouts, concurrency, and external logging. |
| [Dry-run analysis](operation/dry-run-analysis.md) | Non-persistent aggregation analysis with `std:account:list` dry-run mode. |

## Validation and troubleshooting guides

| Guide | Description |
| ----- | ----------- |
| [Testing and validation](validation-and-troubleshooting/testing-and-validation.md) | Structured validation before production. |
| [Troubleshooting](validation-and-troubleshooting/troubleshooting.md) | Common issues, checks, and recovery steps. |

## Deployment guides

| Guide | Description |
| ----- | ----------- |
| [Migrating from Identity Fusion v1](deployment/migrating-from-identity-fusion-v1.md) | Migrate from an earlier Identity Fusion version. |

## Where to go next

| Goal | Resource |
| --- | --- |
| Field-level configuration reference | [Configuration reference](../configuration/index.md) |
| Map, Define, Match framework overview | [Home](../index.md) |
| Domain terms | [Glossary](../glossary.md) |
| Connector operations (APIs ISC calls) | [Connector operations reference](../operations/index.md) |
