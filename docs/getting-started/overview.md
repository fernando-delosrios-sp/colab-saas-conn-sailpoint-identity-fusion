# Overview

Your first week with Identity Fusion NG — from connector install through a verified aggregation.

For prerequisites, operation modes, and deployment patterns, see the [Use guides overview](../use-guides/index.md). This page gives a **Day 1–7 checklist** with links to the guides you need at each step.

## Day 1–7 checklist

| Day | Goal | Actions | Guide |
| --- | --- | --- | --- |
| **1** | Install and connect | Upload connector; create Fusion source; set PAT; **Review and Test** | [Connection Settings](../configuration/connection.md) · [ISC PAT scopes](../reference/pat-scopes.md) |
| **2** | Choose deployment mode | Decide **umbrella** (authoritative Match) vs **side-car** (Map/Define only); set Fusion **Authoritative** flag | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) |
| **3** | Configure scope and sources | Add managed sources; set **sources scope** and optional **identity scope**; pick source types | [Source types](../use-guides/configuration/source-types.md) |
| **4** | Map and Define | Attribute mappings, Velocity definitions, unique IDs | [Mapping attributes](../use-guides/configuration/mapping-attributes.md) · [Defining attributes](../use-guides/configuration/defining-attributes.md) |
| **5** | Match (if needed) | Matching rules, reviewers, correlation mode | [Matching identities](../use-guides/configuration/matching-identities.md) · [Managing reviewers](../use-guides/configuration/managing-reviewers.md) |
| **6** | First aggregation | Discover schema; run account aggregation; verify accounts and logs | [First aggregation](first-aggregation.md) |
| **7** | Validate and tune | Dry-run analysis; adjust thresholds; document PAT scopes | [Dry-run analysis](../use-guides/operation/dry-run-analysis.md) · [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |

## Operation modes (summary)

Each managed source has a **Source type** that controls processing:

| Mode | Behavior | Typical use |
| --- | --- | --- |
| **Authoritative accounts** | Full Map, Define, and Match | Fusion owns correlation when authoritative |
| **Records** | Map and Define; register unique values without new identities | Username pools, identifier generation |
| **Orphan accounts** | Match-only supplemental data; non-matched rows dropped | Contractor directories, supplemental Match |

See [Source types](../use-guides/configuration/source-types.md) for full behavior.

## Deployment patterns

| Pattern | Fusion authoritative? | When to use |
| --- | --- | --- |
| **[Umbrella mode](../glossary.md#deployment-and-integration)** | **Yes** | Match with review forms; Fusion decides create vs correlate |
| **[Side-car mode](../glossary.md#deployment-and-integration)** | **No** | Map/Define enrichment, Records pools, Orphan supplemental Match |

The [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) guide walks through **sources scope** vs **identity scope** and when each applies.

## Not sure which guide to open?

Use [Which guide do I need?](which-guide.md) for a decision tree based on your deployment goal.

## Read next

| Step | Resource |
| --- | --- |
| Run your first aggregation | [First aggregation](first-aggregation.md) |
| Full guide index | [Use guides overview](../use-guides/index.md) |
| Domain terms | [Glossary](../glossary.md) |
