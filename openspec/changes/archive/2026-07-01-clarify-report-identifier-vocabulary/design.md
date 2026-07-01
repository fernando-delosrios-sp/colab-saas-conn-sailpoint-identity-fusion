## Context

`FusionDecision.account.id` is the connector's composite managed-account key (`sourceId::nativeIdentity`). The report service maps finished decisions into `FusionReportDecision` rows for HTML/email rendering. Throughout that mapping the composite key is passed around under the parameter name `accountId`, and the resulting row type also exposes an `accountId` field.

That is misleading because the same codebase also uses "account id" to mean the platform `Account.id` (ISC account UUID). For example, `SourceService.resolveIscAccountIdForManagedKey(managedKey)` returns the ISC account UUID, and `UrlContext.humanAccount(accountId)` expects the platform account UUID.

## Goals / Non-Goals

**Goals:**
- Make the report-decision identifier chain unambiguous.
- Rename fields and parameters so `accountId` only refers to the ISC account UUID, and the composite key is consistently called `managedAccountKey`.
- Keep all existing report output behavior identical.

**Non-Goals:**
- Changing the `FusionDecision` model or the composite-key construction.
- Redesigning `FusionAccountRepository` or `getFusionAccountByNativeIdentity` semantics.
- Adding new report fields or changing rendered output.

## Decisions

1. **`FusionReportDecision.accountId` → `managedAccountKey`.**
   The field holds `decision.account.id`, which is documented as the composite managed key. Its name and JSDoc will match that.

2. **Resolver parameters in `reportService.ts` use `managedAccountKey`.**
   `resolveAccountName` and `resolveAccountUrl` currently receive the composite key; their signatures and internals will say so.

3. **`toReportDecision` binds `managedAccountKey` early.**
   A single local assignment at the top of the mapper avoids scattering `decision.account.id` and makes the downstream calls self-describing.

4. **Templates keep using `accountName`, `accountUrl`, `accountSource`.**
   The HTML/Handlebars templates do not render the raw identifier, so no user-visible change occurs. The email-data type will drop or rename the unused `accountId` property to avoid leaking the internal key under a public name.

5. **Test doubles mirror production parameter names.**
   Mock implementations of `resolveIscAccountIdForManagedKey` and `getFusionAccountByNativeIdentity` will use `managedAccountKey`/`nativeIdentity` as appropriate so the tests document the real contract.

## Risks / Trade-offs

- Renaming a public-ish report type field is technically a breaking change for any external consumer of `FusionReport` JSON, but the field is an internal connector report payload and the raw composite key is not meaningfully useful to consumers. If downstream systems read `accountId`, they will need to update to `managedAccountKey`.
- The change is purely mechanical but touches a type used by the messaging service; lint and typecheck must pass.
