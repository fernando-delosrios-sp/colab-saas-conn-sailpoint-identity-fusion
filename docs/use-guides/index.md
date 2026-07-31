# Use guides

Scenario-based guides for configuring, operating, validating, and deploying Identity Fusion NG. Start with [Getting started](../getting-started/overview.md) for a Day 1–7 checklist, or use [Which guide do I need?](../getting-started/which-guide.md) to pick a configuration path.

Each guide walks through real setup patterns and tuning recipes. For exact field keys, types, defaults, and allowed values, use the linked [Configuration reference](../configuration/index.md) page.

## Getting started

| Guide | Description |
| ----- | ----------- |
| [Overview](../getting-started/overview.md) | Day 1–7 checklist, operation modes, umbrella vs side-car |
| [First aggregation](../getting-started/first-aggregation.md) | Run and verify your first aggregation |
| [Which guide do I need?](../getting-started/which-guide.md) | Decision tree to configuration guides |

## Prerequisites

Before you configure Identity Fusion NG in ISC:

- Install the Identity Fusion NG connector package using your organization's process (for example SailPoint CLI or an internal pipeline).
- Create a dedicated ISC identity and [Personal Access Token](https://documentation.sailpoint.com/saas/help/common/pat.html) with the scopes listed in [ISC PAT scopes](../reference/pat-scopes.md). The minimal set covers sources, accounts, search, forms, workflows, and identity profiles; conditional scopes apply when Match, reverse correlation, or aggregation control is enabled.
- Decide which Map, Define, and Match stages you need. You can use them independently or together, but the connector always evaluates configured steps in Map → Define → Match order.
- Decide whether the Fusion source must be **authoritative** in ISC. Authoritative is required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

## First aggregation checklist

The shortest path from a new Fusion source to a working aggregation:

1. **Create the source** — In Admin → Connections → Sources, create a source with the Identity Fusion NG connector. Set **Authoritative** when you rely on Match for correlation decisions (umbrella mode).
2. **Configure connection** — Set the Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
3. **Configure processing** — Start with [Configuring sources and scope](configuration/configuring-sources-and-scope.md) (scope, managed sources, umbrella vs side-car), then [Source types](configuration/source-types.md) per managed source:
    - **Map:** [Mapping attributes](configuration/mapping-attributes.md) (merge strategy and per-attribute mappings).
    - **Define:** [Defining attributes](configuration/defining-attributes.md) (Velocity, unique IDs, UUIDs, counters).
    - **Match (if used):** [Matching identities](configuration/matching-identities.md), [Managing correlation](configuration/managing-correlation.md), and [Managing reviewers](configuration/managing-reviewers.md) after sources and baseline are correct.
4. **Discover schema** — Run **Discover Schema** so ISC loads the Fusion account schema.
5. **Identity profile and aggregation** — Attach an identity profile and provisioning plan as required, then run entitlement and account aggregation.

## Operation modes

Each managed source has a **Source type** that controls processing. See [Source types](configuration/source-types.md) for full behavior.

| Mode | Behavior | Typical use |
| --- | --- | --- |
| **Authoritative accounts** (default) | Full Map, Define, and Match; non-matched rows can create identities when Fusion is authoritative | Fusion owns correlation decisions for that source |
| **Records** | Map and Define run; unique values register without emitting Fusion accounts for non-matched rows | Identifier generation without new identities |
| **Orphan accounts** | Non-matched rows are dropped (optional disable on managed source) | Supplemental data for Match only |

## Deployment patterns

| Goal | Fusion authoritative? | Managed sources |
| --- | --- | --- |
| **Match** (correlation and deduplication) | **Yes** (umbrella mode) | One or more Authoritative account sources |
| **Map and Define only** (unique IDs, consolidated attributes) | Usually **no** (side-car mode) | Optional; depends on Map requirements |
| **Records** (register unique values without new identities) | Usually non-authoritative | Records-type sources |
| **Orphan** (match-only supplemental data) | Non-authoritative | Orphan-type sources |

The connector can run side by side with other ISC sources. In **umbrella mode**, Fusion determines which incoming managed accounts create a new identity and which correlate to an existing one. In **side-car mode**, Fusion enriches or assists without owning identity creation.

## Configuration guides

| Guide | Description |
| ----- | ----------- |
| [Configuring sources and scope](configuration/configuring-sources-and-scope.md) | Scope, umbrella vs side-car, aggregation, owners as reviewers. **Start here.** |
| [Source types](configuration/source-types.md) | Authoritative, Records, and Orphan processing modes. |
| [Mapping attributes](configuration/mapping-attributes.md) | Attribute mapping, merging, and consolidation from multiple sources. |
| [Defining attributes](configuration/defining-attributes.md) | Attribute definitions (Velocity computed attributes, unique identifiers, UUIDs, counters). |
| [Matching identities](configuration/matching-identities.md) | Detect and resolve potential matching identities using one or more sources. |
| [Managing correlation](configuration/managing-correlation.md) | Correlation modes, reverse correlation, enforced correlation roles, and when to use each. |
| [Managing reviewers](configuration/managing-reviewers.md) | Reviewer access profiles, global vs per-source assignment, and review workload. |
| [Review forms and reviewers](configuration/review-forms-and-reviewers.md) | Review form fields, expiration, automatic merge, and end-to-end Match flow. |
| [Tuning matching algorithms](configuration/tuning-matching-algorithms.md) | Algorithms, thresholds, and how scores combine. |
| [Match tuning cookbooks](configuration/match-tuning-cookbooks.md) | HR+AD, Records pool, and Orphan cleanup worked examples. |

## Operation guides

| Guide | Description |
| ----- | ----------- |
| [Connection and observability tuning](operation/connection-and-observability-tuning.md) | Queue, retry, timeouts, concurrency, and external logging. |
| [Dry-run analysis](operation/dry-run-analysis.md) | Non-persistent aggregation analysis with `std:account:list` dry-run mode. |

## Validation and troubleshooting guides

| Guide | Description |
| ----- | ----------- |
| [Data-driven testing process](validation-and-troubleshooting/testing-and-validation.md) | Scenario recording, replay, and regression verification. |
| [Troubleshooting](validation-and-troubleshooting/troubleshooting.md) | Common issues, checks, and recovery steps. |

## Deployment guides

| Guide | Description |
| ----- | ----------- |
| [Migrating from Identity Fusion v1](deployment/migrating-from-identity-fusion-v1.md) | Migrate from an earlier Identity Fusion version. |

## Where to go next

| Goal | Resource |
| --- | --- |
| Getting started checklist | [Getting started — Overview](../getting-started/overview.md) |
| Field-level configuration reference | [Configuration reference](../configuration/index.md) |
| Map, Define, Match framework overview | [Home](../index.md) |
| Domain terms | [Glossary](../glossary.md) |
| Connector operations (APIs ISC calls) | [Connector operations reference](../operations/index.md) |
| Status and reviewer entitlements | [Entitlement list](../operations/entitlement-list.md) |

