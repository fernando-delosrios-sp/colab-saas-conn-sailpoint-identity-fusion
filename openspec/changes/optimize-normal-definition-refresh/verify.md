# Verify — optimize-normal-definition-refresh

**Status:** PASS

**Verifier:** manual (openspec-verify-change skill not installed in this workspace)

## Checks

| Check | Result |
| --- | --- |
| All `tasks.md` items `[x]` | PASS |
| Scenario tests named after spec scenarios (`refresh flag semantics`, sequential render-context reuse) | PASS |
| Canonical tests + `npm run typecheck` + `npm run lint` | PASS |
| `openspec validate --all --json` — both changes `valid: true` | PASS |
| Design D1–D5 reflected (per-definition skip, account-level gate without `anyNormalDefinitionRefresh`, render context reuse, Datefns cache, `onStats` skipped counts) | PASS |
| Defining-attributes guide already matches implementation — no use-guide edit | PASS |
| Changelog 2026-08-25 Improvements | PASS |

## Spec vs code

- `refresh: false` + existing value + stale account does not call `evaluateAttributeTemplate`.
- `refresh: true` still evaluates when `needsRefresh` is false.
- `needsRefresh`, `needsReset`, and `forceAttributeRefresh` override the skip.
- Account-level early return when every Normal definition has `refresh: false`.
- One `createRenderContextForPass` per `refreshNormalAttributes` invocation.
- `copyVelocityCallerContext` lives in `velocityCallerContext.ts` so tests can spy one copy per pass.
- Tenant-like mix (17 refresh-true, 5 refresh-false) asserts `onStats` `{ evaluated: 17, skipped: 5 }` on an unchanged account (CI stand-in for task 5.4).
- `refreshAllAttributes` reuses the same per-account render context for Normal definitions.

## Follow-ups from verify

Warnings and suggestions from `/opsx-verify` were addressed in follow-up tests and the `velocityCallerContext` extract. Live tenant `normalDefineMs` compare remains optional outside CI.
