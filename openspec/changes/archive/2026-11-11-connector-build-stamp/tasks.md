## 1. Stamp library (tests first)

- [x] 1.1 Add `scripts/__tests__/connector-build-stamp.test.cjs` covering `formatBuildStamp`: clean input renders `Build: def5678 2026-11-01 2.2.0/preview`; dirty input renders `def5678-dirty`; fully missing input renders `Build: unknown`.
- [x] 1.2 Add cases for `resolveBuildStamp` with an injected command runner: `GITHUB_REF_NAME` wins over the local branch; `GITHUB_HEAD_REF` is used when `GITHUB_REF_NAME` is absent; detached checkout without CI env renders `detached`; a failing git command renders `unknown` instead of throwing.
- [x] 1.3 Add cases for dirty detection: a modified source file marks dirty; a modified `connector-spec.json` does not; an ignored path does not.
- [x] 1.4 Add cases for injection: a stamped copy gains one `Build:` sentence after the installed connector version sentence; injecting twice leaves exactly one `Build:` sentence showing the newer value; a spec without a Developer Settings section fails loudly.
- [x] 1.5 Add a guard test that `parse → JSON.stringify(spec, null, 4) + "\n"` reproduces the committed `connector-spec.json` byte-for-byte, so stamping cannot introduce formatting drift.
- [x] 1.6 Implement `scripts/connector-build-stamp.cjs`: `formatBuildStamp`, `resolveBuildStamp`, `injectBuildStamp`, `stampConnectorSpecFile`, `restoreConnectorSpecFile`, and a `--print` / `--write` / `--restore` CLI.
- [x] 1.7 Add a test that the stamped Developer Settings help passes `collectViolations` from `scripts/connector-spec-help-lib.cjs` (length and sentence limits).

## 2. Packaging wrapper

- [x] 2.1 Add `scripts/__tests__/packConnectorZip.test.cjs` using an injected command runner: exit 0 restores the original bytes and returns 0; exit 1 restores the original bytes and returns non-zero; the stamped content is on disk while the command runs.
- [x] 2.2 Implement `scripts/pack-connector-zip.cjs`: read `connector-spec.json`, write the stamped copy, run `spcx package` from the local bin with inherited stdio, restore in `finally`, propagate the exit code.
- [x] 2.3 In `package.json`, repoint `pack-zip` to `node scripts/pack-connector-zip.cjs` and add `build:stamp` as `node scripts/connector-build-stamp.cjs --print`; leave `prepack-zip` as `npm ci && npm run build`.
- [x] 2.4 Confirm `npm run build:stamp` prints the stamp and leaves `connector-spec.json`, `dist/`, and `git status` unchanged.

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npm test` (redirect to a file when output is long; do not pipe to `tail` or `head`).
- [x] 3.2 Run `npm run pack-zip` twice from a clean tree and confirm both zips carry the same `Build:` line, and that `git status --porcelain` is empty afterwards.
- [x] 3.3 Run `npm run pack-zip` with an uncommitted source edit and confirm the stamp carries `-dirty`.
- [x] 3.4 Force the package command to fail and confirm `connector-spec.json` is unchanged and the exit code is non-zero.
- [x] 3.5 Run `npm run lint` (ESLint, connector spec help check, knip) and `npm run typecheck`.
- [x] 3.6 All delta spec scenarios covered by named automated tests or the manual checks above (coverage evidence for `/opsx:verify`).

## 4. Documentation

- [x] 4.1 Add `docs/use-guides/operation/verify-deployed-connector-build.md`: when to use this, where the stamp appears, `npm run build:stamp`, equal / different / `-dirty` outcomes, and the limits (packages uploaded before this feature show the version only).
- [x] 4.2 Add the guide to `mkdocs.yml` under Operation guides, after **Reset Fusion state**.
- [x] 4.3 Add a **Connector build stamp** row to `docs/glossary.md` and amend the **Installed connector version** row to say it is a release label, not build identity.
- [x] 4.4 Update `docs/use-guides/operation/reset-fusion-state.md` to point at Developer Settings section help and link the new guide, without repeating the comparison workflow.
- [x] 4.5 Update the troubleshooting guide's **Environment** row to name the connector build stamp as the build evidence to collect.
- [x] 4.6 Add the **Connector build stamp** row to the Configuration vocabulary table in `openspec/specs/ubiquitous-language/spec.md` alongside the matching ADDED requirement, so archive merge is a no-op conflict.
- [x] 4.7 Run `npm run lint:markdown`, `npm run lint:docs-guides`, and `npm run docs:prepare`.

## 5. Changelog

- [x] 5.1 Create the changelog entry for this change via **changelog-generator** during apply.
- [x] 5.2 Confirm the entry covers the user-visible change: Developer Settings section help in a packaged connector now shows a connector build stamp, and `npm run build:stamp` prints the current checkout's stamp.
