# Identity Fusion NG — Documentation

This folder contains the **usage guides** linked from the [main README](../README.md).

## Guide index

| Guide                                                                               | Description                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Migration from previous Identity Fusion](guides/migration-from-previous-fusion.md) | Migrate from an earlier Identity Fusion version using the old source as managed, schema alignment, and a higher-priority identity profile plus identity refresh. |
| [Map](guides/map.md)                                                                | Map account attributes into a unified schema representation.                                                                                                     |
| [Define](guides/define.md)                                                          | Define generated identifiers and Velocity computed attributes.                                                                                                   |
| [Match](guides/match.md)                                                            | Configure sources and Fusion Settings to detect and resolve potential duplicate identities.                                                                      |
| [Advanced connection settings](guides/advanced-connection-settings.md)              | Queue, retry, batching, timeouts, and external logging.                                                                                                          |
| [Proxy mode](guides/proxy-mode.md)                                                  | Run connector logic on an external server and connect ISC via proxy.                                                                                             |
| [Troubleshooting](guides/troubleshooting.md)                                        | Common issues, checks, and recovery steps.                                                                                                                       |

## Assets (screenshots and videos)

Placeholder paths used in the guides:

- **Screenshots:** `docs/assets/images/` — add the image files referenced in the HTML comments in each guide (e.g. `attribute-generation-source-settings.png`).
- **Videos:** `docs/assets/videos/` — add the video files referenced in the guides (e.g. `identity-fusion-migration.mov`, `attribute-generation-unique-id.mp4`, `match-flow.mp4`).

After adding a file, the markdown image/video link in the guide will work as long as the filename matches. Image paths in the guides are relative to this `docs/` folder (e.g. `../assets/images/...` from `docs/guides/`).
