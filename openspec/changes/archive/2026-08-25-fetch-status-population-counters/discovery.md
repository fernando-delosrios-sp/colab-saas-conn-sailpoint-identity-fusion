## Scope

In: account-list Fetch STATUS SHALL show independent population counters for Fusion accounts, managed accounts, and identities (when identity Fetch runs), instead of one last-writer `progress=` slot. Out: per-source managed breakdown (proposal D), HTTP-vs-ingest stage on STATUS (proposal C), Refresh/Process/Output single-slot `progress=`, forms/workflow Fetch as STATUS counters, raising the 5-minute command ceiling.

## Language

**Fetch population counter** (`promote`):
A STATUS segment for one Fetch inventory: Fusion accounts, managed accounts, or identities. Independent `done/total` on the same STATUS line; not the shared `progress=` slot.
_Avoid_: treating `fetched` / `ingested` as which population; `identities=skipped` as a required token

**Managed-accounts (Fetch counter)** (`draft`):
The aggregate census of managed-source accounts in Fetch (sum of known source totals). One counter, not per source.
_Avoid_: listing Jackdaw/HR/Student as separate STATUS progress tokens (queue-pending already shows HTTP offsets)

**Fusion-accounts (Fetch counter)** (`draft`):
The Fusion-source inventory counter on Fetch STATUS. Distinct from the managed aggregate even when the two censuses happen to be equal.
_Avoid_: calling this `ingested` or “previous Fusion accounts” as the unit name

Conflicts-with-canonical: **Ingested (progress unit)** remains the name of bulk-ingest *work*, not a Fetch STATUS unit after this change. Fetch STATUS SHALL NOT use `progress=… ingested` as the sole pipeline fraction. DETAIL `action=ingesting …` MAY remain.

## Decisions

Context: Parallel Fetch (`Promise.all` of identities, managed accounts, Fusion accounts, forms) overwrites one `OperationRunContext.progress`. A tenant log showed alternating `8500/158951 fetched` (managed sum) and `28250/102407 ingested` (Fusion), so operators could not see both loads at once. Identity Fetch was skipped. `queue-pending` already listed per-source HTTP offsets.

Q1: STATUS axis for Fetch — who vs stage vs both?
Chosen: **who (proposal B)**. Three independent counters. Stage stays off STATUS (`queue-pending` plus optional DETAIL ingest lines).

Q2: Identities when Fetch is skipped?
Chosen: **omit the identities segment**. Do not print `identities=skipped`.

Q3: Managed granularity?
Chosen: **one aggregate** (proposal B, not D). Per-source HTTP remains `queue-pending`.

Q4: Forms / delayed-aggregation sender?
Chosen: **not STATUS counters**. Still parallel Fetch tasks; they do not get population fractions.

Q5: What does `done` mean per counter?
Chosen: **items registered into the operation-run cache for that population**, total = known census (`X-Total-Count` / search total) when known. Managed registration is per HTTP page. Fusion/identities registration is bulk ingest (lags HTTP by at most a page).

Q6: Refresh and later phases?
Chosen: **unchanged** single `progress=` with existing units (`refreshed`, `analyzed`, …).

## Open questions

None blocking. Delta suffix per population segment: yes, independent baselines (first tick that includes a segment omits that segment’s Δ).

## Scenarios discussed

- Identity Fetch skipped → STATUS has fusion-accounts + managed-accounts only.
- Identity Fetch on → third segment; must not overwrite Fusion/managed.
- Equal Fusion and Jackdaw censuses (102407) → two counters, two labels; operators can tell them apart.
- One population finished, another still paging → finished counter stays at N/N; live counter keeps moving on the same line.
- Empty Fusion Fetch → omit fusion-accounts until a total or first registration exists (no `0/0` flicker); same for identities.
- Heartbeat delta: managed Δ and fusion Δ both present when both advanced; no baseline reset from “unit change” between fetched and ingested.
- DETAIL `ingesting fusion-accounts count=` MAY still fire; it is not a substitute for the fusion-accounts STATUS segment.
