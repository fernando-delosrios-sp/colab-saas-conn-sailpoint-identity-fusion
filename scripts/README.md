# Scripts

## Documentation (MkDocs)

These scripts prepare the `docs/` tree for MkDocs and optional local builds.

| Script                      | Purpose                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `prepare-docs.cjs`            | Runs `generate-config-docs.cjs`, `copy-license-for-docs.cjs`, `copy-changelog-for-docs.cjs`, and `check-lean-ctx-docs.cjs` (used by `npm run docs:prepare`). |
| `generate-config-docs.cjs`    | Generates `docs/configuration/*.md` from `connector-spec.json`.                                                       |
| `check-connector-spec-help.cjs` | Validates ISC help format: HTML `sectionHelpMessage` + `docLink`/`docLinkLabel` on sections; plain-text `helpKey` on fields (runs in `npm run lint`). |
| `check-lean-ctx-docs.cjs`     | Fails if any file under `docs/` contains `lean-ctx: omitted` placeholder corruption.                                  |
| `copy-license-for-docs.cjs`   | Copies `LICENSE.txt` into `docs/LICENSE.txt` so the home page can link to it for MkDocs validation.                |
| `copy-changelog-for-docs.cjs` | Copies `CHANGELOG.md` into `docs/CHANGELOG.md` so the home page can link to it for MkDocs validation.              |
| `slim-connector-spec-help.cjs` | Refreshes section overviews and `docLink` fields; strips markdown from field `helpKey` strings. |
| `slim-connector-spec-helpkeys.cjs` | Deprecated alias for `slim-connector-spec-help.cjs`. |
| `docs-venv.cjs`             | Creates or uses `.venv`, installs `requirements-docs.txt`, and runs `mkdocs build` or `mkdocs serve`.                   |

`sync-docs-home.cjs` is **retired** — Home is authored directly in `docs/index.md`.

Publishing to GitHub Pages is handled in CI (`.github/workflows/deploy-docs-pages.yml`); use `npm run docs:*` only if you want a local virtualenv and preview.
