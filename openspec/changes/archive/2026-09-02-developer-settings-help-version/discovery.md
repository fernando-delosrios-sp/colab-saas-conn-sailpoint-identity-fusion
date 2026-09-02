## Scope

In: the Developer Settings `sectionHelpMessage` in `connector-spec.json` (and its canonical template in `scripts/connector-spec-help-lib.cjs`) MUST include the **installed connector version** from `package.json`, and lint MUST fail when they drift. Out: putting the version in `sectionTitle`; showing the version in MkDocs Configuration reference intros; changing field `helpKey` copy; any runtime version API.

## Language

**Installed connector version** (`promote`):
The semver string in `package.json` `version` for the connector package operators have installed in ISC.
_Avoid_: build number, git SHA, ISC platform version, “installed connector version” as prose with no digits

**Developer Settings** (canonical — reuse):
The Advanced Settings section for operation tuning (reset flags, force refresh, batch size, concurrency).
_Avoid_: Advanced Connection Settings, External Settings

**sectionHelpMessage** (canonical ISC field — reuse):
The HTML overview shown when an operator expands a configuration section in ISC source config.
_Avoid_: `helpKey` (per-field tooltip), `sectionTitle` (section heading)

## Decisions

Context: `connector-spec.json` Developer Settings help currently *describes* that the section header shows the version, but `sectionTitle` is plain `Developer Settings` and the help string contains no semver. Operators cannot confirm which package they have from that help. Earlier docs work avoided a hardcoded semver so help would not go stale; that left the number out entirely.

Q1: Where does the version appear?
Chosen: **`sectionHelpMessage` only.** User request. `sectionTitle` stays `Developer Settings` so `SECTION_HELP` lookup and docs generators keep a stable key.

Q2: Source of the number?
Chosen: **`package.json` `version`.** Same source as the published connector package.

Q3: How does it stay current on every bump?
Chosen: **Canonical template interpolates `package.json` version; lint asserts the committed `connector-spec.json` string contains that exact semver.** Slim/sync already rewrites section help from `SECTION_HELP`. Version bump without rewriting help fails `npm run lint`.

Q4: MkDocs generated Configuration reference?
Chosen: **No version in `SECTION_INTRO_OVERRIDES`.** Docs must not churn on every release. ISC inline help is the operator-facing version surface. Use-guide prose that currently claims the *header* shows the version MUST be corrected.

Q5: Character / sentence limits?
Chosen: **Keep existing help-lib limits.** Rewrite Developer Settings overview so the version sentence still fits `SECTION_HELP_MAX` / `SECTION_HELP_MAX_SENTENCES` (runtime: 1000 chars / 10 sentences). Do not relax limits for this change.

## Open questions

None blocking.

Assumed: version display is the package semver (e.g. `2.2.0`), not a `v` prefix unless already conventional in operator-facing copy — use the raw `package.json` value.

Deferred: injecting version into other sections or into `helpKey` strings.

## Scenarios discussed

- Operator expands Developer Settings in ISC — help contains the current package semver as visible text.
- Maintainer bumps `package.json` to `2.3.0` and runs slim/sync — `connector-spec.json` help contains `2.3.0`, not the previous version.
- Maintainer bumps `package.json` but leaves stale help — `check-connector-spec-help` fails.
- `sectionTitle` remains `Developer Settings` — help-lib `SECTION_HELP` key and docs generators still match.
- Generated `docs/configuration/advanced.md` intro does not embed a changing semver.
- Use guide `reset-fusion-state.md` no longer claims the *section header* displays the version.
