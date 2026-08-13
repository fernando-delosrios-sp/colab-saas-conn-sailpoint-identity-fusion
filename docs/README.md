# Identity Fusion NG — Documentation

Identity Fusion NG documentation is published as an MkDocs site with five top-level sections.

## Site sections

| Section | Start here | Description |
| --- | --- | --- |
| **Home** | [Home](index.md) | Product framing and inline Map-Define-Match framework |
| **Use guides** | [Getting started](getting-started/index.md) | Setup checklist, deployment patterns, goal-based paths, and scenario guides |
| **Configuration reference** | [Configuration reference](configuration/index.md) | Generated field reference from `connector-spec.json` |
| **Glossary** | [Glossary](glossary.md) | Canonical domain terms |
| **Technical reference** | [Standard account schema](reference/standard-account-schema.md) | Schema, Velocity context, observability, operations, config-to-phases, PAT scopes |
| **Changelog** | [Changelog](CHANGELOG.md) | Release history (copied from root `CHANGELOG.md` on `docs:prepare`) |

## Getting started

[Getting started](getting-started/index.md) is a single page covering prerequisites, the setup checklist, first-aggregation verification, operation modes, deployment patterns, goal-based guide selection, and a shallow-to-deep reading order for all scenario guides.

Individual guides live under `use-guides/` (configuration, operation, validation, deployment) and are linked from Getting started and from the MkDocs nav.

## Operation diagram PNGs

C4 container diagrams are authored as editable `.drawio` files under `docs/operations/diagrams/`. Published pages embed PNG exports from `docs/assets/images/operations/`.

**Re-export after editing a diagram:**

```bash
node scripts/export-drawio-pngs.cjs
```

Requires network access (uses the diagrams.net convert service). Alternatively, open the `.drawio` file in [draw.io](https://app.diagrams.net/) and export PNG to `docs/assets/images/operations/<operation-slug>.png`.

## Build locally

```bash
npm run docs:prepare
npm run docs:serve
```

Generated Configuration reference pages live under `docs/configuration/` and are recreated on each `docs:prepare` run. The Home page is authored in `docs/index.md`.

`connector-spec.json` inline help follows the [ISC connector spec](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/connector-spec): **sections** use HTML `sectionHelpMessage` for a short overview plus separate `docLink` / `docLinkLabel` fields for clickable documentation links; **fields** use plain-text `helpKey` only (markdown links are not rendered in ISC). Detailed reference lives on the MkDocs site. `npm run lint` runs `scripts/check-connector-spec-help.cjs` to enforce these rules. Use `node scripts/slim-connector-spec-help.cjs` when bulk-refreshing help text.

