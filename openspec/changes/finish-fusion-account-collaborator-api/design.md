## Context

`FusionAccount` was split (State + rules), then collapsed into three collaborators (`FusionCollections`, `FusionCorrelation`, `FusionLayers`). Collapse left a hybrid: collaborators own behavior, but a thick flat facade and `_internal_*` factory leaks remain, and canonical specs still describe the deleted State/rules design. This change finishes the Jul 22 intent and updates living specs/glossary so architecture docs match code.

Stakeholders: connector maintainers and AI agents navigating the model; no tenant-facing behavior change.

## Goals / Non-Goals

**Goals:**
- Single public TypeScript API: collaborator paths on `FusionAccount`
- Thin `FusionAccount` (identity, bag, factories, output; no 1:1 pass-through surface)
- Collaborators encapsulate their fields (no factory `_internal_*` access)
- Living `fusion-service` + ubiquitous-language + glossary describe collaborators; State/rules removed from contract
- Behavior-preserving refactor (tests stay green without intentional semantic changes)

**Non-Goals:**
- Renaming `FusionCollections` / `FusionCorrelation` / `FusionLayers`
- Changing ISC operation contracts or attribute wire format
- Restoring `FusionAccountState` or rule modules
- Changing `syncToBag` to write `previous` (spec aligns to current-only)
- Broad product-guide rewrites beyond glossary alignment
- Recording/replay / `FusionRun` changes

## Decisions

### D1: Finish collaborator collapse (Path A), do not revive State
- **Choice**: Migrate callers to `collections` / `correlation` / `layers`; delete flat 1:1 wrappers
- **Reason**: Encapsulated behavior-rich objects; one narrative; matches Jul 22 approved direction
- **Considered alternatives**: Spec-only hybrid docs (leaves dual API); Path B hide collaborators (rejected by product owner); restore State+rules (failed Jul 17 cleanliness goals)

### D2: Document structural terms without renaming
- **Choice**: Add UL/glossary entries for the three collaborators and “Fusion account collaborators” as architecture vocabulary; keep existing type names
- **Reason**: Docs close the clarity gap; rename expands blast radius without behavior value
- **Considered alternatives**: Rename for friendlier domain words in same change (deferred)

### D3: Disambiguate “correlation”
- **Choice**: UL MUST distinguish business **correlation** (ISC account↔identity linking) from **FusionCorrelation** (collaborator owning promises / mark-correlated helpers on a Fusion account)
- **Reason**: Same English word, different scopes; docs must prevent conflation
- **Considered alternatives**: Rename collaborator (out of scope)

### D4: What stays on FusionAccount
- **Choice**: Keep identity/key/name/email/type, `attributeBag` accessors needed by Map/Define, static `configure` + factories, `toISCAccount`, and any true multi-collaborator orchestration that cannot live cleanly on one collaborator
- **Reason**: Account remains the aggregate root; collaborators are parts, not orphan globals
- **Considered alternatives**: Force all attribute bag access through a fourth collaborator (over-split)

### D5: Replace `_internal_*` with construction APIs
- **Choice**: Add explicit methods on collaborators for hydrate-from-persisted-attributes / factory seeding; factories call those methods only
- **Reason**: Encapsulation without leaking mutable sets across type boundaries
- **Considered alternatives**: Keep `_internal_*` as permanent package API (undermines cleanliness)

### D6: Sync-to-bag contract
- **Choice**: Spec requires sync into the **current** attribute bag (and related origin/identity fields as today); do not require writing collection mirrors into `previous`
- **Reason**: Matches shipped code; no evidence previous-bag collection sync is required for correctness
- **Considered alternatives**: Implement dual-bag write (behavior change; out of cleanliness scope)

## Risks / Trade-offs

- **[Risk] Large mechanical caller/test migration breaks temporarily** → Mitigation: migrate by package (model tests first, then services/operations); keep `tsc` + targeted vitest green per batch
- **[Risk] Missed flat-API call sites (dynamic access / tests)** → Mitigation: delete wrappers so TypeScript fails closed; ripgrep for old method names before claiming done
- **[Risk] Overload of “correlation” confuses docs readers** → Mitigation: explicit UL disambiguation (D3)
- **[Trade-off] Call sites become more verbose (`collections.statuses.add`)** → Reason for acceptance: verbosity buys explicit ownership; flat wrappers were false convenience
- **[Trade-off] Structural UL terms are implementation-facing** → Reason for acceptance: agents need them; business terms remain primary for product language

## Migration Plan

N/A for tenant deployment — connector-internal TypeScript API.

**Apply sequence:**
1. Spec/UL/glossary deltas land with the change (planning already defines them)
2. Add collaborator construction/hydrate APIs; switch factories off `_internal_*`
3. Migrate callers/tests to collaborator API in batches
4. Remove flat 1:1 methods from `FusionAccount`
5. Verify with `tsc`, lint, full test suite

**Rollback:** Revert the PR; no persisted data migration.

## Open Questions

None blocking. Optional follow-up (explicitly deferred): rename collaborators for friendlier structural vocabulary after this lands.
