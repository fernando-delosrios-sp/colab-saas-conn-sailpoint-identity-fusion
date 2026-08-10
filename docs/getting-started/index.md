# Getting started

Install, connect, and configure Identity Fusion NG in ISC — then run and verify your first aggregation. This page is a **router**: prerequisites, setup checklist, first-aggregation verification, and links to topic guides.

For exact field keys, types, defaults, and allowed values, use the [Configuration reference](../configuration/index.md).

## Prerequisites

Before you configure Identity Fusion NG in ISC:

- Install the Identity Fusion NG connector package using your organization's process (for example SailPoint CLI or an internal pipeline).
- Create a dedicated ISC identity and [Personal Access Token](https://documentation.sailpoint.com/saas/help/common/pat.html) with the scopes listed in [ISC PAT scopes](../reference/pat-scopes.md). The minimal set covers sources, accounts, search, forms, workflows, and identity profiles; conditional scopes apply when Match, reverse correlation, or aggregation control is enabled.
- Decide which Map, Define, and Match stages you need. You can use them independently or together, but the connector always evaluates configured steps in Map → Define → Match order.
- Decide whether the Fusion source must be **authoritative** in ISC. Authoritative is required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

## Setup checklist

The shortest path from a new Fusion source to a working aggregation:

1. **Add the connector to ISC** — Upload the Identity Fusion NG connector (for example via SailPoint CLI or your organization's process).
2. **Create the source** — In Admin → Connections → Sources, create a source with the Identity Fusion NG connector. Set **Authoritative** when you need Match (umbrella mode).
3. **Configure connection** — Set the Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity. See [ISC PAT scopes](../reference/pat-scopes.md) for required API permissions.
4. **Configure the connector** — Use the [Configuration reference](../configuration/index.md) and [Configuration guides overview](../use-guides/configuration/index.md). Start with [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md), then:
    - **Map:** [Mapping attributes](../use-guides/configuration/mapping-attributes.md) (merge strategy and per-attribute mappings).
    - **Define:** [Defining attributes](../use-guides/configuration/defining-attributes.md) (Velocity, unique IDs, UUIDs, counters).
    - **Match (if used):** [Matching identities](../use-guides/configuration/matching-identities.md), [Managing correlation](../use-guides/configuration/managing-correlation.md), and [Managing reviewers](../use-guides/configuration/managing-reviewers.md) after sources and baseline are correct.
5. **Discover schema** — Run **Discover Schema** so ISC has the combined account schema.
6. **Entitlement aggregation** — Run **Entitlement Aggregation** on the Fusion source so ISC loads status and action entitlements (including per-source reviewer entitlements). **Required after Discover Schema and before account aggregation.** Re-run after adding managed sources.
7. **Identity profile and account aggregation** — Attach an identity profile and provisioning plan as required by ISC, then run account aggregation.

## First aggregation in ISC

After connection and Map/Define/Match configuration are in place:

1. **Discover schema** — Admin → Connections → Sources → your Fusion source → **Discover Schema**. Confirm the combined account schema loads without errors.
2. **Entitlement aggregation** — Run **Entitlement Aggregation** on the Fusion source. ISC must load status and action entitlements (including per-source reviewer entitlements) before account aggregation. Re-run after adding managed sources. See [Entitlement list](../operations/entitlement-list.md).
3. **Identity profile** — Attach an identity profile and provisioning plan as required by your ISC deployment.
4. **Run account aggregation** — Trigger **Account aggregation** on the Fusion source (or wait for the scheduled task).
5. **Monitor logs** — Open Application Logs or your external logging endpoint. Search for `PHASE 1 Setup` through `PHASE 5 Output` and `EPILOGUE report` (see [Config to account-list phases](../reference/config-to-phases.md)).

### Verification checklist

| Check | Expected result | If it fails |
| --- | --- | --- |
| **Test connection** | Review and Test succeeds | [Troubleshooting — Connection and authentication](../use-guides/validation-and-troubleshooting/troubleshooting.md#category-1-connection-and-authentication) |
| **Entitlements aggregated** | Status and action entitlements appear on the Fusion source (including per-source reviewer entitlements when Match is used) | Run **Entitlement Aggregation** after Discover Schema and after adding managed sources |
| **Managed sources exist** | All configured source names resolve | Verify source names match ISC exactly |
| **Accounts emitted** | Fusion accounts appear in ISC after aggregation | Check scope, source filters, and `Skip accounts with a missing identifier` |
| **Match outcomes** (if Match enabled) | Review forms, auto-merge, or non-matched entitlements as configured | [Matching identities](../use-guides/configuration/matching-identities.md) |
| **No reset flags stuck** | **Reset accounts?** / **Reset forms?** auto-disable after one run | Clear flags in Developer Settings if a run aborted mid-flight |
| **Log phases complete** | `PHASE N … END elapsed=` for phases 1–5; epilogue runs | [Config to account-list phases](../reference/config-to-phases.md) |

## Deployment and source types

Umbrella vs side-car deployment, source types (**Authoritative**, **Records**, **Orphan**), and scope are covered in:

- [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) — umbrella vs side-car, managed sources, identity scope
- [Source types](../use-guides/configuration/source-types.md) — per-source processing behavior

## Finding the right guide

Know your goal? Use **Choose your path** below. For a suggested reading order across configuration topics, see **Guides to read**.

## Choose your path

| Your goal | Start here | Also read |
| --- | --- | --- |
| **First-time setup** | [Setup checklist](#setup-checklist) on this page | [First aggregation in ISC](#first-aggregation-in-isc) |
| **HR + AD deduplication (umbrella Match)** | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) | [Matching identities](../use-guides/configuration/matching-identities.md) · [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |
| **Username / ID pool (Records side-car)** | [Source types — Records](../use-guides/configuration/source-types.md) | [Defining attributes](../use-guides/configuration/defining-attributes.md) · [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |
| **Contractor orphan cleanup** | [Source types — Orphan](../use-guides/configuration/source-types.md) | [Matching identities](../use-guides/configuration/matching-identities.md) |
| **Map only — merge multi-source attributes** | [Mapping attributes](../use-guides/configuration/mapping-attributes.md) | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) |
| **Reverse correlation to managed source** | [Managing correlation](../use-guides/configuration/managing-correlation.md) | [ISC PAT scopes](../reference/pat-scopes.md) |
| **Debug aggregation logs** | [Monitor aggregation progress](../use-guides/operation/monitor-aggregation-progress.md) | [Config to account-list phases](../reference/config-to-phases.md) · [Troubleshooting](../use-guides/validation-and-troubleshooting/troubleshooting.md) |

## Guides to read

Suggested order for first-time configuration. Each link is a standalone topic guide.

| # | Guide | Topic |
| --- | --- | --- |
| 1 | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) | Scope, managed sources, aggregation |
| 2 | [Source types](../use-guides/configuration/source-types.md) | Authoritative, Records, Orphan |
| 3 | [Mapping attributes](../use-guides/configuration/mapping-attributes.md) | Attribute merging |
| 4 | [Defining attributes](../use-guides/configuration/defining-attributes.md) | Velocity, unique IDs |
| 5 | [Matching identities](../use-guides/configuration/matching-identities.md) | Match rules and thresholds |
| 6 | [Managing reviewers](../use-guides/configuration/managing-reviewers.md) | Reviewer assignment |
| 7 | [Review forms and reviewers](../use-guides/configuration/review-forms-and-reviewers.md) | Review form settings |
| 8 | [Managing correlation](../use-guides/configuration/managing-correlation.md) | Correlation modes |
| 9 | [Tuning matching algorithms](../use-guides/configuration/tuning-matching-algorithms.md) | Algorithms and score blending |
| 10 | [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) | Worked deployment examples |

**Operations and validation:** [Configuration guides overview](../use-guides/configuration/index.md) · [Operation guides overview](../use-guides/operation/index.md) · [Match flow reference](../reference/match-flow.md) · [Testing and validation](../use-guides/validation-and-troubleshooting/testing-and-validation.md) · [Troubleshooting](../use-guides/validation-and-troubleshooting/troubleshooting.md) · [Migrating from Identity Fusion v1](../use-guides/deployment/migrating-from-identity-fusion-v1.md)

