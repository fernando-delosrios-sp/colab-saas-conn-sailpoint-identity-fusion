# Identity Fusion NG — Documentation

This folder is the MkDocs **`docs_dir`**. The published site is built in CI from `main` (see `.github/workflows/deploy-docs-pages.yml`).

## Start here

| Page | Description |
| ---- | ----------- |
| [Get started](get-started.md) | Shortest path from new source to aggregation. |
| [Map, define, and match](concepts/map-define-match.md) | How the processing pipeline fits together. |
| [Guides overview](guides/index.md) | Full list of configuration guides. |

The [home page](home.md) mirrors the repository README (generated before build).

## Guide index

| Guide | Description |
| ----- | ----------- |
| [Map](guides/map.md) | Attribute mapping, merging, and consolidation from multiple sources. |
| [Define](guides/define.md) | Attribute definitions (Velocity computed attributes, unique identifiers, UUIDs, counters). |
| [Match](guides/match.md) | Detect and resolve potential matching identities using one or more sources. |
| [Source configuration](guides/source-configuration.md) | In-depth guide on source settings, scope, aggregation timing, and correlation modes. |
| [Migration from previous Identity Fusion](guides/migration-from-previous-fusion.md) | Migrate from an earlier Identity Fusion version: add the old source as managed, align schemas, then migrate. |
| [Advanced connection settings](guides/advanced-connection-settings.md) | Queue, retry, batch sizing, timeouts, and external logging. |
| [Proxy mode](guides/proxy-mode.md) | Run connector logic on an external server and connect ISC via proxy. |
| [Troubleshooting](guides/troubleshooting.md) | Common issues, checks, and recovery steps. |

## Assets (screenshots and videos)

Placeholder paths used in the guides:

- **Screenshots:** `docs/assets/images/` — add the image files referenced in the HTML comments in each guide (for example `attribute-generation-source-settings.png`).
- **Videos:** `docs/assets/videos/` — add the video files referenced in the guides (for example `identity-fusion-migration.mov`, `attribute-generation-unique-id.mp4`, `match-flow.mp4`).

After adding a file, the markdown image or video link in the guide works when the filename matches. From `docs/guides/`, image paths use `../assets/images/...`.

## Contributing to docs

See [Contributing to documentation](contributing/documentation.md).
