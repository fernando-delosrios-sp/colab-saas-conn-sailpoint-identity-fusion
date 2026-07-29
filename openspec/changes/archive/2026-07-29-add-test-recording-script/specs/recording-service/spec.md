## ADDED Requirements

### Requirement: CJS finalize scripts SHALL preserve connector-written scenario config

When `finalize-chain-artifacts.cjs` rebuilds `scenario.json` from on-disk `steps.ndjson`, it MUST preserve the existing `config` object from a prior `scenario.json` if that config is non-empty. The CJS finalize path MUST NOT overwrite connector-written `FusionConfig` with an empty object.

#### Scenario: Re-finalize preserves config
- **GIVEN** `recordings/my-chain/scenario.json` exists with a non-empty `config.sources` array written by the connector
- **WHEN** `finalizeChainArtifacts('my-chain')` runs (e.g. from `record-chain.js` exit handler)
- **THEN** the rebuilt `scenario.json` retains the prior `config` object
- **AND** steps and reference values are refreshed from `steps.ndjson`

#### Scenario: First finalize without prior scenario uses empty config fallback
- **GIVEN** `recordings/my-chain/steps.ndjson` exists but no `scenario.json`
- **WHEN** `finalizeChainArtifacts('my-chain')` runs
- **THEN** `scenario.json` is written with `config: {}` as fallback
- **AND** steps are compiled from `steps.ndjson`
