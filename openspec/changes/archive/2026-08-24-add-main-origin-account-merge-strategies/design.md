## Context

Map merge today is source-order (First found, with `mainAccount` checked first then the rest), multi-value (list / concatenate), or source-name pin. Operators who want one account use Source name + `$originSource`, which filters by the prioritized account’s **source name** and then takes the first account on that source. That is not the immutable origin snapshot Velocity exposes as `$account`, and it cannot be a global default.

This change adds two **account-snapshot** strategies on both merge radios. MappingService already has `getMainAccountContextAccount` and injects the Identities identity bag when `originSource === 'Identities'`. Origin snapshot resolution for Map will follow the same objects DefinitionService uses for `$account`.

## Goals / Non-Goals

**Goals:**
- Persist `mainAccount` and `originAccount` as `AttributeMergeMode` values; include them in `DefaultAttributeMergeMode`
- Put **Main account** first on both radios; new-install default `attributeMerge` is `mainAccount`
- Resolve one snapshot per attribute: Main = `mainAccount` snapshot if found else origin; Origin = origin only
- Read mapped attributes from that snapshot only; missing snapshot or empty value → undefined (existing Map clear/preserve path)
- Keep First found, list, concatenate, Source name, and `$originSource` token behavior unchanged
- Document origin vs managed origin and Main vs Origin vs First found

**Non-Goals:**
- Migrating stored `attributeMerge` on existing sources
- Changing Velocity context (`$account`, `$originSource`, `$originAccount`)
- Removing or reinterpreting the `$originSource` Source-name token
- Adding Source name to the global radio
- Falling through to source order when the chosen snapshot has no value
- Changing Identity-type skip-mapping

## Decisions

### D1: Persisted values match schema attribute names
- **Choice**: `AttributeMergeMode.MainAccount = 'mainAccount'`, `AttributeMergeMode.OriginAccount = 'originAccount'`
- **Reason**: UI labels, schema attributes, and config values stay aligned; `DefaultAttributeMergeMode` can include both (unlike `source`, which still needs a name field)
- **Considered alternatives**: Short `main`/`origin` (rejected — extra mapping layer; existing `source` is short because it is not a schema attribute)

### D2: Origin snapshot resolver in MappingService, aligned with `$account`
- **Choice**: Before the mapping loop, resolve `originSnapshot` from the Fusion account: if `originSource` is Identities and `originAccount` matches the identity id, use `attributeBag.identity` (already injected as source `Identities`); else find the managed row in `sourceAttributeMap` whose `getManagedAccountSnapshotKey` (or `_id`) equals `originAccount`
- **Reason**: Same objects as Velocity `$account`; Mapping already has the Identities bag and key finder for `mainAccount`
- **Considered alternatives**: Reuse DefinitionService’s private `resolveOriginAccountObjectForVelocity` (rejected for this change — private, Velocity-specific schema wrapping); extract a shared util only if both copies drift in apply

### D3: Helpers take an explicit origin snapshot
- **Choice**: Pass `originSnapshot` into `processAttributeMapping` as an optional argument. Origin account merge reads only that snapshot. Main account merge reads `prioritizedAccount` if present, else `originSnapshot`. Neither iterates `sourceOrder`
- **Reason**: Keeps First found / Source name on the existing loop; account modes cannot accidentally fall through
- **Considered alternatives**: Encode as Source name with a synthetic token (rejected — source-level, wrong grain); treat as First found with a one-account `sourceOrder` (rejected — easy to reintroduce fallback)

### D4: Radio order and default
- **Choice**: Main account, Origin account, First found, Keep a list, Concatenate; per-attribute adds Source name last. `connectorSpecInitialValues.attributeMerge` and `connector-spec.json` initialValues become `mainAccount`. `readSettings` missing-key fallback follows the new default
- **Reason**: Locked in discovery; Source name still needs `parentValue: source`
- **Considered alternatives**: Origin as default (rejected — user chose Main)

### D5: First found unchanged
- **Choice**: First found still checks `prioritizedAccount` then walks source order. Origin snapshot is not a First found fallback
- **Reason**: Existing sources keep `"first"`; Main/Origin are the no-fallback policies
- **Considered alternatives**: Make First found fall back to origin when `mainAccount` is unset (rejected — that is Main account merge)

### D6: Schema cardinality
- **Choice**: SchemaService continues to set `multi` only for `AttributeMergeMode.List`. Main/Origin are single-valued
- **Reason**: Existing List-only check; no schema-service requirement change
- **Considered alternatives**: Treat account modes as list (rejected — one snapshot, one value)

## Risks / Trade-offs

- [Risk] New sources get Main account merge while operators still expect First found / source-order HR-then-AD → Mitigation: docs table; changelog; existing sources unchanged
- [Risk] Origin or main snapshot missing this run (missing-accounts) clears mapped attributes → Mitigation: document no-fallback; operators who want fill-in use First found
- [Risk] Identity-origin Main account with `mainAccount` pointing at a managed row looks like “HR overwrote identity” → Mitigation: document identity-origin vs managed-origin matrix
- [Trade-off] `$originSource` token remains a third, source-level pin → Reason: leave existing Source name cards; docs distinguish token vs Origin account merge
- [Trade-off] Missing `attributeMerge` key on read now defaults to Main account instead of First found → Reason: same `?? runtimeDefaults` path; well-formed ISC config always persists the radio

## Migration Plan

1. Ship connector update. No ISC config rewrite.
2. Existing sources keep stored `attributeMerge` (`first`, `list`, `concatenate`, per-attribute `source`).
3. New sources and newly added mapping cards use Main account unless the operator picks another radio.
4. Operators who already set Source name = `$originSource` keep that card; they may switch to Main account or Origin account for account-level pin.
5. Rollback: revert connector version. Stored `mainAccount`/`originAccount` values on a rolled-back build fall through `readSettings` to the old default (`first`) unless the old build rejects unknown radio values — treat unknown persisted values as First found in `readSettings` if the platform round-trips them.

## Open Questions

None.
