# Which guide do I need?

Use this decision tree to find the right configuration guide for your deployment goal.

```mermaid
flowchart TD
    Start([What is your primary goal?]) --> Match{Need similarity Match<br/>with review or auto-merge?}
    Match -- Yes --> Umbrella[Umbrella mode — Fusion authoritative]
    Umbrella --> CS[Configuring sources and scope]
    CS --> ST[Source types — Authoritative sources]
    ST --> MI[Matching identities]
    MI --> Cook[Match tuning cookbooks]

    Match -- No --> MapOnly{Need Map / Define only<br/>or unique IDs?}
    MapOnly -- Yes --> Sidecar[Side-car mode — Fusion usually non-authoritative]
    Sidecar --> CS2[Configuring sources and scope]
    CS2 --> Records{Register unique values<br/>without new identities?}
    Records -- Yes --> STrec[Source types — Records]
    STrec --> Def[Defining attributes]
    Records -- No --> Map[Mapping attributes]

    MapOnly -- No --> Orphan{Supplemental data<br/>for Match only?}
    Orphan -- Yes --> STorp[Source types — Orphan]
    STorp --> MI2[Matching identities]
    Orphan -- No --> Ops[Connection and observability tuning]
```

## Outcome table

| Your goal | Start here | Also read |
| --- | --- | --- |
| **HR + AD deduplication (umbrella Match)** | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) | [Matching identities](../use-guides/configuration/matching-identities.md) · [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |
| **Username / ID pool (Records side-car)** | [Source types — Records](../use-guides/configuration/source-types.md) | [Defining attributes](../use-guides/configuration/defining-attributes.md) · [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md) |
| **Contractor orphan cleanup** | [Source types — Orphan](../use-guides/configuration/source-types.md) | [Matching identities](../use-guides/configuration/matching-identities.md) |
| **Map only — merge multi-source attributes** | [Mapping attributes](../use-guides/configuration/mapping-attributes.md) | [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) |
| **Reverse correlation to managed source** | [Managing correlation](../use-guides/configuration/managing-correlation.md) | [ISC PAT scopes](../reference/pat-scopes.md) |
| **Debug aggregation logs** | [Config to account-list phases](../reference/config-to-phases.md) | [Troubleshooting](../use-guides/validation-and-troubleshooting/troubleshooting.md) |
| **First-time setup (Day 1–7)** | [Getting started overview](overview.md) | [First aggregation](first-aggregation.md) |

## Glossary quick links

- [Umbrella mode](../glossary.md#deployment-and-integration) — authoritative Fusion Match deployment
- [Side-car mode](../glossary.md#deployment-and-integration) — non-authoritative Map/Define or Orphan
- [Sources scope](../glossary.md#deployment-and-integration) — managed accounts from configured sources
- [Identity scope](../glossary.md#deployment-and-integration) — optional ISC identity baseline for Match
