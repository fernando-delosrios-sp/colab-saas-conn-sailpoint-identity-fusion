# Identity Fusion NG

> **Disclaimer:** Identity Fusion NG is the newest Identity Fusion version and supersedes any Identity Fusion v1.x previous release. Version 1.x is now **deprecated**. For those needing to upgrade an existing deployment, please refer to the [migration guide](docs/use-guides/deployment/migrating-from-identity-fusion-v1.md).

![Identity Fusion NG Framework](docs/assets/images/Identity_Fusion_NG_Framework.png)

Identity Fusion NG is an **Identity Security Cloud (ISC) connector** that consolidates account data from one or more managed sources, lets you **map** attributes into a single Fusion account schema, **define** derived and unique values (including Velocity-based computation), and optionally **match** new or changed accounts to existing identities.

**Documentation**

- Full documentation site: [GitHub Pages](https://fernando-delosrios-sp.github.io/colab-saas-conn-sailpoint-identity-fusion/)
- Source docs: [documentation folder](docs/README.md)
- Home (Map → Define → Match framework): [docs/index.md](docs/index.md)

## Quick start

1. Add the connector to ISC.
2. Create a Fusion source (mark **Authoritative** when you need Match).
3. Configure connection — see [ISC PAT scopes](docs/reference/pat-scopes.md) for required API permissions.
4. Configure Map, Define, and Match — [Configuration reference](docs/configuration/index.md) and [Getting started](docs/getting-started/index.md).
5. Run **Discover Schema**, entitlement aggregation, then account aggregation.

See [Getting started](docs/getting-started/index.md) for prerequisites, the setup checklist, goal-based paths, and all scenario guides.

## Scenario recording and replay

Capture scenarios via ISC **External Settings** on proxy deployments (`externalRecordingEnabled` + `recordingName`). For local workflows:

| Command | Purpose |
| --- | --- |
| `npm run replay -- tenant/scenario` | Interactive replay — spawns connector, auto-feeds steps, live output |
| `npm run test-recording -- tenant/scenario` | Headless golden verification (CI / regression) |
| `npm run record` | Deprecated local capture escape hatch |
| `npm run finalize -- tenant/scenario` | Recover `scenario.json` after crash |

Full reference: [Scenario recording](docs/reference/scenario-recording.md).

## Build docs locally

```bash
npm run docs:serve
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt).

