# Brainstorm: Harden operation specs (Gherkin)

## Goal

Replace placeholder connector operation specs with precise inline Gherkin (GIVEN/WHEN/THEN) aligned to implementation. Close the largest spec-vs-code gaps for provisioning and support operations without touching account-list.

## Locked decisions (grilling)

- **correlate/correlated** → fusion-service; derived-outcome model (`correlated` granted iff `missing-accounts` empty after build)
- **correlate Add** on provisioning path → direct PATCH only (`forceDirectCorrelation`)
- **report / fusion / reviewer:*** → duplicated summary Add/Remove in account-create + account-update only
- **Reverse-correlation attributes** → fusion-service lifecycle on every Fusion account build/return
- **ATTR_OPS matrix** → per-op requirements (REFRESH/RESET/NONE)
- **account-list** → no changes Phase 1
- **Errors** → observable message patterns
- **Ubiquitous language** → review terms one-by-one before adding (deferred sub-loop)

## Gap inventory (code → spec)

| Area | Code | Was missing from spec |
|------|------|------------------------|
| accountCreate | identity name, preprocess, Requested, immutability, actions | Placeholder only |
| accountRead | ATTR_OPS_REFRESH, cascade swallow | Placeholder only |
| accountUpdate | ATTR_OPS_NONE, actions-only, snapshot restore, correlate Remove skip | Placeholder only |
| accountEnable/Disable | preprocess+RESET vs REFRESH+preserve asymmetry | Placeholder only |
| testConnection | conditional JMESPath/workflow/reverse checks | Placeholder only |
| entitlementList | status static, action dynamic reviewer:* | Placeholder only |
| fusion-service | derived correlated, correlate PATCH, reverse attr lifecycle | Partial |

## Approach

Bottom-up code audit + test cross-check (`src/operations/__tests__/`). Delta specs under this change; archive merges to `openspec/specs/`.
