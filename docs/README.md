# Identity Fusion NG — Documentation

Identity Fusion NG documentation is published as an MkDocs site with five top-level sections.

## Site sections

| Section | Start here | Description |
| --- | --- | --- |
| **Home** | [Home](index.md) | Product framing and inline Map-Define-Match framework |
| **Use guides** | [Use guides overview](use-guides/index.md) | Prerequisites, first aggregation, and scenario-driven how-tos |
| **Configuration reference** | [Configuration reference](configuration/index.md) | Generated field reference from `connector-spec.json` |
| **Glossary** | [Glossary](glossary.md) | Canonical domain terms |
| **Technical reference** | [Standard account schema](reference/standard-account-schema.md) | Schema, Velocity context, observability, operations, proxy, scenario recording |

## Use guides index

The [Use guides overview](use-guides/index.md) includes prerequisites, the first-aggregation checklist, operation modes, and links to every guide below.

### Configuration guides

| Guide | Description |
| --- | --- |
| [Configuring sources and scope](use-guides/configuration/configuring-sources-and-scope.md) | Scope, umbrella vs side-car, aggregation, and reviewers |
| [Source types](use-guides/configuration/source-types.md) | Authoritative, Records, and Orphan processing modes |
| [Mapping attributes](use-guides/configuration/mapping-attributes.md) | Attribute mapping and merge strategies |
| [Defining attributes](use-guides/configuration/defining-attributes.md) | Velocity, unique IDs, UUIDs, counters |
| [Matching identities](use-guides/configuration/matching-identities.md) | Match detection and baseline configuration |
| [Managing correlation](use-guides/configuration/managing-correlation.md) | Correlation modes, reverse correlation, enforced roles |
| [Managing reviewers](use-guides/configuration/managing-reviewers.md) | Reviewer access profiles and assignment |
| [Review forms and reviewers](use-guides/configuration/review-forms-and-reviewers.md) | Manual review workflow and Match flow |
| [Tuning matching algorithms](use-guides/configuration/tuning-matching-algorithms.md) | Algorithms, thresholds, and score blending |

### Operation guides

| Guide | Description |
| --- | --- |
| [Dry-run analysis](use-guides/operation/dry-run-analysis.md) | Non-persistent account-list analysis |
| [Connection and observability tuning](use-guides/operation/connection-and-observability-tuning.md) | Queue, retry, timeouts, logging |

### Validation and troubleshooting guides

| Guide | Description |
| --- | --- |
| [Testing and validation](use-guides/validation-and-troubleshooting/testing-and-validation.md) | Structured validation before production |
| [Troubleshooting](use-guides/validation-and-troubleshooting/troubleshooting.md) | Common issues and recovery |

### Deployment guides

| Guide | Description |
| --- | --- |
| [Migrating from Identity Fusion v1](use-guides/deployment/migrating-from-identity-fusion-v1.md) | Upgrade from Identity Fusion 1.x |

## Build locally

```bash
npm run docs:prepare
npm run docs:serve
```

Generated Configuration reference pages live under `docs/configuration/` and are recreated on each `docs:prepare` run. The Home page is authored in `docs/index.md`.

