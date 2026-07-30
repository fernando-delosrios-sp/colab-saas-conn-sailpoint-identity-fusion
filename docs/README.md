# Identity Fusion NG — Documentation

Identity Fusion NG documentation is published as an MkDocs site with six top-level sections.

## Site sections

| Section | Start here | Description |
| --- | --- | --- |
| **Home** | [Home](index.md) | Product framing and inline Map-Define-Match framework |
| **Getting started** | [Overview](getting-started/overview.md) | Prerequisites, operation modes, first aggregation checklist |
| **Configuration reference** | [Configuration reference](configuration/index.md) | Generated field reference from `connector-spec.json` |
| **Use guides** | [Use guides overview](use-guides/index.md) | Scenario-driven how-tos (configuration, operation, validation, deployment) |
| **Glossary** | [Glossary](glossary.md) | Canonical domain terms |
| **Technical reference** | [Standard account schema](reference/standard-account-schema.md) | Schema, Velocity context, observability, operations, proxy, chain recording |

## Use guides index

### Configuration guides

| Guide | Description |
| --- | --- |
| [Mapping attributes](use-guides/configuration/mapping-attributes.md) | Attribute mapping and merge strategies |
| [Defining attributes](use-guides/configuration/defining-attributes.md) | Velocity, unique IDs, UUIDs, counters |
| [Matching identities](use-guides/configuration/matching-identities.md) | Match detection and baseline configuration |
| [Review forms and reviewers](use-guides/configuration/review-forms-and-reviewers.md) | Manual review workflow and access profiles |
| [Tuning matching algorithms](use-guides/configuration/tuning-matching-algorithms.md) | Algorithms, thresholds, and score blending |
| [Configuring sources](use-guides/configuration/configuring-sources.md) | Source scope, aggregation, and correlation modes |

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

## Legacy paths

Older bookmarks under `docs/guides/` and `docs/get-started.md` redirect to the new locations listed above.

## Build locally

```bash
npm run docs:prepare
npm run docs:serve
```

Generated Configuration reference pages live under `docs/configuration/` and are recreated on each `docs:prepare` run.
