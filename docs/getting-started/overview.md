# Overview

This page covers prerequisites and the three **operation modes** that determine how managed source accounts relate to identities. For a step-by-step setup checklist, continue to [First aggregation](first-aggregation.md).

## Prerequisites

Before you configure Identity Fusion NG in ISC:

- Install the Identity Fusion NG connector package using your organization's process (for example SailPoint CLI or an internal pipeline).
- Create a dedicated ISC identity and [Personal Access Token](https://documentation.sailpoint.com/saas/help/common/pat.html) with permissions for sources, identities, accounts, and workflows or forms.
- Decide which Map, Define, and Match stages you need. You can use them independently or together, but the connector always evaluates configured steps in Map → Define → Match order.
- Decide whether the Fusion source must be **authoritative** in ISC. Authoritative is required for most **Match** deployments so Fusion can decide which managed accounts create identities versus correlate to existing ones. For **Map and Define only**, Fusion is often **not** authoritative.

For field-level settings, use the [Configuration reference](../configuration/index.md). For scenario-driven setup, use the [Use guides](../use-guides/index.md).

## Operation modes

Each managed source in **Source Settings** has a **Source type** that controls how its accounts are processed. Identity Fusion NG supports three operation modes:

### Authoritative accounts

**Authoritative accounts** is the default source type. Managed source accounts run the full Map, Define, and Match pipeline. When an account does not match an existing identity, Fusion creates a new ISC identity (when the Fusion source is authoritative).

Use this mode when Fusion should own correlation decisions for incoming accounts from that source.

Fusion typically acts as an umbrella over the sources it manages when matching authoritative accounts to avoid duplication. In that deployment pattern, Fusion replaces the identity profile with its own.

Optional per-source settings include **Deferred candidate matching**, which compares non-matched accounts against other provisional Fusion accounts from the same source in the same run before creating a new identity.

### Records

**Records** sources run Map and Define and may register unique attribute values, but they do **not** output ISC Fusion accounts for non-matched rows. Use Records when you need identifier generation or attribute normalization without creating identities from that source.

For Records sources, **Include record accounts in Match** controls whether those accounts participate in Match scoring:

- **On (default):** Record accounts are scored like other managed accounts using your global Match rules.
- **Off:** Match scoring is skipped. A bulk **record unique registration** step runs selective Map plus unique-value registration before the uncorrelated match sweep.

See [Configuring sources](../use-guides/configuration/configuring-sources.md) for per-source options and filters.

### Orphan accounts

**Orphan accounts** sources drop managed accounts that do not match an existing identity. No new Fusion account or identity is created for non-matched rows.

Use this mode when a source contributes attributes to matching but should never create identities on its own—for example, supplemental directory data used only for correlation.

For Orphan sources, **Disable non-matching accounts** optionally triggers a background account disable operation for stale orphan accounts that lack a match.

## Deployment patterns

You can use Map, Define, and Match independently or together:

| Goal | Typical authority | Managed sources |
| --- | --- | --- |
| **Match** (correlation and deduplication) | Fusion source is **authoritative** | One or more authoritative account sources |
| **Map and Define only** (unique IDs, consolidated attributes) | Fusion is often **not** authoritative | Optional; depends on your Map requirements |
| **Records** (register unique values without new identities) | Usually non-authoritative | Records-type sources |
| **Orphan** (match-only supplemental data) | Usually non-authoritative | Orphan-type sources |

The connector can run side by side with other ISC sources. When Fusion is authoritative for Match, it determines which incoming managed accounts create a new identity and which correlate to an existing one.

## Where to go next

| Goal | Resource |
| --- | --- |
| First aggregation checklist | [First aggregation](first-aggregation.md) |
| Source types, filters, correlation modes | [Configuring sources](../use-guides/configuration/configuring-sources.md) |
| Map, Define, Match setup | [Use guides](../use-guides/index.md) |
| Field definitions | [Configuration reference](../configuration/index.md) |
| Domain terms | [Glossary](../glossary.md) |
