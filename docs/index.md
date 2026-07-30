# Identity Fusion NG

!!! warning "Disclaimer"
    Identity Fusion NG is the newest Identity Fusion version and supersedes any Identity Fusion v1.x previous release. Version 1.x is now **deprecated**. For those needing to upgrade an existing deployment, please refer to the [migration guide](use-guides/deployment/migrating-from-identity-fusion-v1.md).

Identity Fusion NG is an **Identity Security Cloud (ISC) connector** that consolidates account data from one or more managed sources, lets you **map** attributes into a single Fusion account schema, **define** derived and unique values (including Velocity-based computation), and optionally **match** new or changed accounts to existing identities so you can avoid duplicate identities without brittle exact-match correlation alone.

## When to use it

- You need **consistent attributes** across messy or multi-source account data before correlation.
- You need **generated or normalized identifiers** (unique IDs, UUIDs, counters, formatted strings) that standard sources do not provide.
- You need **similarity-based matching** and optional **manual review** when authoritative correlation rules are not enough.

## The Map, Define, Match framework

Identity Fusion NG processes accounts in a fixed **logical order**: **Map**, then **Define**, then **Match**. You can use only the stages you need, but the connector always evaluates configured steps in this sequence.

![Identity Fusion NG Framework](assets/images/Identity_Fusion_NG_Framework.png)

For definitions of the terms used here and across the documentation, see the [glossary](glossary.md).

### Map (consolidation)

**Map** aligns managed account attributes with your Fusion account schema. When several sources contribute to the same attribute, the connector merges values using your chosen strategy (for example first found, distinct list, concatenate, or a preferred source).

Strict correlation often fails when data is inconsistent. Creating, normalizing, and combining attributes from multiple sources is complex. The connector provides flexible merging strategies when multiple sources contribute to the same attribute.

See [Mapping attributes](use-guides/configuration/mapping-attributes.md) for mapping rules, per-attribute overrides, and merge behavior.

### Define (computation and unique values)

**Define** creates or normalizes attributes after mapping. That includes Apache Velocity expressions, unique identifiers with collision handling, immutable UUIDs, counters, and refreshes on aggregation.

ISC has no built-in way to generate unique identifiers and handle value collision. The connector provides powerful attribute definition using Apache Velocity templates, unique ID generation with disambiguation counters, immutable UUID assignment, and computed attributes.

See [Defining attributes](use-guides/configuration/defining-attributes.md) for expression context, attribute types, and tips for unique attributes.

### Match (correlation)

**Match** compares Fusion accounts to identities in scope using weighted similarity rules, optional manual review, and configurable merging. It is what prevents duplicate identities when data is messy or incomplete.

The connector provides similarity-based match detection comparing the resulting mapped and defined Fusion accounts against your identity baseline. It offers optional manual review workflows and configurable merging of account attributes.

See [Matching identities](use-guides/configuration/matching-identities.md) and [Tuning matching algorithms](use-guides/configuration/tuning-matching-algorithms.md) for rules, thresholds, and review workflows.

## Documentation map

| Section | Start here | What you'll find |
| --- | --- | --- |
| **Getting started** | [Overview](getting-started/overview.md) | Prerequisites, operation modes, and your first aggregation checklist |
| **Configuration reference** | [Configuration reference](configuration/index.md) | Field-level reference for every ISC configuration menu and section |
| **Use guides** | [Use guides overview](use-guides/index.md) | Scenario-driven how-tos for configuration, operation, validation, and deployment |
| **Glossary** | [Glossary](glossary.md) | Canonical definitions for connector terms and concepts |
| **Technical reference** | [Standard account schema](reference/standard-account-schema.md) | Schema attributes, Velocity context, operations, observability, and deployment reference |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.
