## Why

Preview work packs and uploads packages against a released version, so every tenant shows the same `Installed connector version: 2.2.0` no matter which commit it runs. Operators cannot tell a tenant that has the latest preview from one that is days behind, and the same ambiguity hides in released `v2.2.0` zips because the release tag is force-moved to the newest `main` commit. The version string answers "which release label is this?" but it is being used to answer "which bits are installed?", and those are different questions. Stamping the exact build into the package makes that second question answerable from inside ISC, with no published reference to maintain.

## What Changes

**Developer Settings help carries a build stamp**

- From: `Installed connector version: 2.2.0` — identical for every package built from any commit on that version.
- To: `Installed connector version: 2.2.0` followed by `Build def5678 2026-11-11 2.2.0/preview`, with `-dirty` appended when source changes were uncommitted at pack time.
- Reason: an operator or maintainer needs to identify the exact tree a tenant runs.
- Impact: non-breaking. Only the packaged `connector-spec.json` changes; the committed file keeps the bare semver.

**Packaging wraps `spcx package`**

- From: `npm run pack-zip` runs `spcx package` directly.
- To: `npm run pack-zip` runs a wrapper that stamps `connector-spec.json`, packages, and always restores the file.
- Reason: the zip is `dist/index.js` plus the repo-root `connector-spec.json`, so stamping must happen between build and package, and the committed tree must not keep the stamp.
- Impact: non-breaking; `prepack-zip` still runs `npm ci && npm run build` first.

**A stamp you can print without packaging**

- From: no way to ask which build the current checkout would produce.
- To: a script that prints the stamp for the current checkout, so a tenant's help line can be compared with the branch tip.
- Reason: comparing requires knowing what "now" is on the maintainer's machine.

## Capabilities

### New Capabilities

- `connector-build-stamp`: how a package gets its build identity, the stamp format, where it appears, the guarantee that packaging restores the committed spec, and the print command used for comparison.

### Modified Capabilities

- `documentation-site`: the Developer Settings section help requirement now covers the packaged build stamp in addition to the installed connector version, and the use-guide copy that tells operators how to confirm a deployed build points at the build stamp.
- `ubiquitous-language`: defines **Connector build stamp** as a canonical term and states that **Installed connector version** is a release label, not build identity.

## Impact

- `package.json`: `pack-zip` script becomes a wrapper invocation; a stamp-print script is added.
- `scripts/`: new stamp library, pack wrapper, and stamp-print entry points; new Vitest cases under `scripts/__tests__/`.
- `scripts/connector-spec-help-lib.cjs`: Developer Settings template unchanged in the committed spec; the stamp is injected after `npm run build` and removed again.
- `connector-spec.json`: untouched on disk; stamped only inside a packaged zip.
- `docs/`: glossary entry, one new operation use guide, cross-links from the reset guide and troubleshooting, `mkdocs.yml` nav.
- `.github/workflows/publish-connector-zip.yml`: no change needed; `main` packages pick up the stamp through `npm run pack-zip`.
- No new dependencies. No change to connector runtime behaviour.
