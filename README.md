# Identity Fusion NG

> **Disclaimer:** Identity Fusion NG is the newest Identity Fusion version and supersedes any Identity Fusion v1.x previous release. Version 1.x is now **deprecated**. For those needing to upgrade an existing deployment, please refer to the [migration guide](docs/use-guides/deployment/migrating-from-identity-fusion-v1.md).

![Identity Fusion NG Framework](docs/assets/images/Identity_Fusion_NG_Framework.png)

**Documentation**

- Full documentation site: [GitHub Pages](https://fernando-delosrios-sp.github.io/colab-saas-conn-sailpoint-identity-fusion/)
- Source docs in this repository: [documentation folder](docs/README.md)
- Start here for the core concepts and architecture: [Identity Fusion NG Framework](docs/collateral/Identity_Fusion_NG_Framework.pdf)

Identity Fusion NG is an **Identity Security Cloud (ISC) connector** that consolidates account data from one or more managed sources, lets you **map** attributes into a single Fusion account schema, **define** derived and unique values (including Velocity-based computation), and optionally **match** new or changed accounts to existing identities so you can avoid duplicate identities without brittle exact-match correlation alone.

**When to use it**

- You need **consistent attributes** across messy or multi-source account data before correlation.
- You need **generated or normalized identifiers** (unique IDs, UUIDs, counters, formatted strings) that standard sources do not provide.
- You need **similarity-based matching** and optional **manual review** when authoritative correlation rules are not enough.

**Read next**

| Step                                   | Resource                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Shortest path to a first aggregation   | [Getting started](docs/getting-started/first-aggregation.md)             |
| How Map → Define → Match fits together | [Home (documentation site)](docs/index.md)                             |
| Field-level configuration reference    | [Configuration reference](docs/configuration/index.md)                 |
| Scenario-driven setup guides           | [Use guides overview](docs/use-guides/index.md)                        |
| Connector operations (APIs ISC calls)  | [Connector operations reference](docs/operations/index.md)             |

Identity Fusion NG addresses the complex challenge of identity and account data aggregation through a streamlined **map-define-match framework**. This concept represents the high-level operation of the connector, which can execute all three steps or just one, but always in this logical sequence:

### The Map, Define, Match Framework

1. **Map (Consolidation)** — Align managed account attributes with your Fusion account schema and merge values from multiple sources.
2. **Define (Computation)** — Create derived attributes, unique identifiers, UUIDs, and Velocity-based transformations.
3. **Match (Correlation)** — Compare Fusion accounts to identities in scope using similarity rules and optional manual review.

For operation modes, prerequisites, and a first-aggregation checklist, see [Getting started](docs/getting-started/overview.md). For every ISC configuration field, see the [Configuration reference](docs/configuration/index.md) on the documentation site.

---

## Overview

| Topic                                                                                    | Description                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Mapping attributes](docs/use-guides/configuration/mapping-attributes.md)                | Attribute mapping, merging, and consolidation from multiple sources.                                         |
| [Defining attributes](docs/use-guides/configuration/defining-attributes.md)              | Attribute definitions (Velocity computed attributes, unique identifiers, UUIDs, counters).                   |
| [Matching identities](docs/use-guides/configuration/matching-identities.md)              | Detect and resolve potential matching identities using one or more sources.                                  |
| [Configuring sources](docs/use-guides/configuration/configuring-sources.md)              | Source settings, scope, aggregation timing, and correlation modes.                                           |
| [Migrating from Identity Fusion v1](docs/use-guides/deployment/migrating-from-identity-fusion-v1.md) | Migrate from an earlier Identity Fusion version.                                                             |
| [Connection and observability tuning](docs/use-guides/operation/connection-and-observability-tuning.md) | Queue, retry, timeouts, rate limiting, and logging.                                                          |
| [Proxy deployment](docs/reference/proxy-mode.md)                                         | Run connector logic on an external server and connect ISC via proxy.                                       |
| [Troubleshooting](docs/use-guides/validation-and-troubleshooting/troubleshooting.md)     | Common issues, logs, and recovery steps.                                                                     |

---

## Quick start

1. **Add the connector to ISC** — Upload the Identity Fusion NG connector (e.g. via SailPoint CLI or your organization's process).
2. **Create a source** — In Admin → Connections → Sources, create a new source using the Identity Fusion NG connector. Mark it **Authoritative** when you need Match.
3. **Configure connection** — Set Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
4. **Configure the connector** — Use the [Configuration reference](docs/configuration/index.md) and [Use guides](docs/use-guides/index.md) for Map, Define, and Match settings.
5. **Discover schema** — Run **Discover Schema** so ISC has the combined account schema.
6. **Identity profile and aggregation** — Create an identity profile and provisioning plan as required by ISC, then run entitlement and account aggregation.

See [First aggregation](docs/getting-started/first-aggregation.md) for the full checklist.

---

## Documentation site (MkDocs)

The documentation site is built with MkDocs and published from the `main` branch by GitHub Actions (`.github/workflows/deploy-docs-pages.yml`).

Local preview:

```bash
npm run docs:serve
```

---

## Changelog

- (2026-07-30) **Documentation:** Restructured MkDocs site into six top-level sections (Home, Getting started, Configuration reference, Use guides, Glossary, Technical reference). Configuration pages are generated from `connector-spec.json`. Legacy `docs/guides/*` URLs redirect to new paths under `docs/use-guides/` and `docs/reference/`.

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## License

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt) for more information.
