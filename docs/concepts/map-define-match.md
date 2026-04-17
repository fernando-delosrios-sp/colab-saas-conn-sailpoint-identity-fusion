# Map, define, and match

Identity Fusion NG processes accounts in a fixed **logical order**: **Map**, then **Define**, then **Match**. You can use only the stages you need, but the connector always evaluates configured steps in this sequence.

## Map (consolidation)

**Map** aligns managed account attributes with your Fusion account schema. When several sources contribute to the same attribute, the connector merges values using your chosen strategy (for example first found, distinct list, concatenate, or a preferred source).

See the [Map](../guides/map.md) guide for mapping rules, per-attribute overrides, and merge behavior.

## Define (computation and unique values)

**Define** creates or normalizes attributes after mapping. That includes Apache Velocity expressions, unique identifiers with collision handling, immutable UUIDs, counters, and refreshes on aggregation.

See the [Define](../guides/define.md) guide for expression context, attribute types, and tips for unique attributes.

## Match (correlation)

**Match** compares Fusion accounts to identities in scope using weighted similarity rules, optional manual review, and configurable merging. It is what prevents duplicate identities when data is messy or incomplete.

See the [Match](../guides/match.md) and [Matching algorithms](../guides/matching-algorithms.md) guides for rules, thresholds, and review workflows.

## Operation modes

Fusion supports distinct ways of relating accounts to identities (for example authoritative accounts, records, and orphan handling). How you configure sources and authority depends on which mode you use.

For mode-specific behavior and source options, read [Source configuration](../guides/source-configuration.md) and the overview on the [home page](../home.md#operation-modes).

## Full configuration reference

Field-level tables for every ISC configuration section live on the [home page](../home.md#reference-configuration-at-a-glance) (synced from the repository README).
