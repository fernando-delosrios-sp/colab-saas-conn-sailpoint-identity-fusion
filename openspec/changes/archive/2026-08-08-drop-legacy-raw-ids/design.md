## Context

Identity Fusion NG stores managed account references in persisted Fusion account attributes. The canonical identifier is the **managed account key** (`sourceId::nativeIdentity`), defined in ubiquitous language and used by factory methods (`fromManagedAccount`, `fromFusionDecision`, form processor validation).

A backwards-compatibility layer still exists for **legacy raw IDs** — plain ISC account UUIDs stored without the composite separator. Documentation advertises this support on `accounts`, `missing-accounts`, and `originAccount`. Code tolerates raw IDs through silent filtering, warning-and-skip paths, and `normalizeCompositeManagedAccountKey(x) ?? x` fallbacks in six production modules.

This change removes that layer so persisted attributes, runtime lookups, and documentation share one contract.

**Stakeholders:** connector maintainers, ISC operators migrating from early Fusion NG deployments, documentation consumers.

## Goals / Non-Goals

**Goals:**

- Require composite managed account keys for all managed-source references in `accounts`, `missing-accounts`, and `originAccount`.
- Remove raw-ID fallback code paths (`?? rawKey` after normalization).
- Update specs, tests, and user docs to composite-key-only contract.
- Preserve identity-ID form for `originAccount` when `originSource` is `Identities`.

**Non-Goals:**

- Auto-migration of persisted raw IDs to composite keys at runtime.
- Changing other legacy features (config `reset` key, observability log patterns, Velocity flat keys, Identity Fusion v1 migration).
- Changing `mainAccount` attribute behavior (separate attribute; out of scope unless it shares the same fallback — verify during apply; grep showed it's separate).

## Decisions

### D1: Invalid key handling — drop with warning, not fail-fast

- **Choice:** Non-composite managed account references are dropped during normalization with a diagnostic warning. Account-read and aggregation continue.
- **Reason:** Avoids blocking production runs for tenants with stale rows; matches existing `FusionLayers` normalization behavior.
- **Considered alternatives:**
  - *Fail-fast on first invalid key* — rejected; too disruptive during migration window.
  - *Auto-resolve raw ID via ISC API* — rejected; reimplements the compatibility layer.

### D2: Remove all `?? rawKey` normalization fallbacks

- **Choice:** Production code uses `normalizeCompositeManagedAccountKey(value)` result only; when undefined, treat as absent/invalid.
- **Reason:** Fallbacks defeat normalization and propagate invalid keys into candidate registry, correlation, and form claim paths.
- **Considered alternatives:**
  - *Keep fallbacks with deprecation log* — rejected; prolongs dual contract.

### D3: `originAccount` validation is context-sensitive

- **Choice:** When `originSource` (or equivalent metadata) is `Identities`, accept plain identity IDs. When origin is a managed source, require composite key.
- **Reason:** Identity-origin baselines legitimately store identity UUIDs; managed-origin accounts must use composite keys.
- **Considered alternatives:**
  - *Require composite for all originAccount values* — rejected; would break identity-origin rows (`Identities::identityId` is used internally but persisted `originAccount` is often the raw identity ID).

### D4: Log message reframing

- **Choice:** Replace "legacy non-composite" / "backwards compatibility" wording with "invalid managed account key (expected sourceId::nativeIdentity)".
- **Reason:** Operators should treat these as data errors, not supported alternate formats.

### D5: Spec deltas target three existing capabilities

- **Choice:** Modify `account-read-operation`, `fusion-service`, and `schema-service` — no new capability directory.
- **Reason:** Behavior change spans read path, fusion account reconstruction, and schema descriptions; all have existing specs.

## Risks / Trade-offs

- **[Breaking change] Persisted raw IDs stop resolving** → Mitigation: document migration — re-run aggregation after source correlation or manually patch attributes to composite keys.
- **[Warning noise during migration]** → Mitigation: one warning per invalid reference per run; acceptable short-term signal.
- **[Trade-off] No auto-repair** → Accepted; keeps scope minimal and avoids hidden API calls.

## Migration Plan

1. **Pre-deploy audit:** Search Fusion account attributes for `accounts`, `missing-accounts`, and `originAccount` values lacking `::` (excluding identity-origin rows where value is an identity ID).
2. **Data fix:** For each invalid managed-source reference, replace with composite key from source account metadata (`source.id` + native identity).
3. **Deploy connector** with this change.
4. **Verify:** Run account-list aggregation; confirm warnings absent and account references resolve.
5. **Rollback:** Revert connector version; no schema migration required (raw IDs remain in ISC until rewritten).

## Open Questions

None.
