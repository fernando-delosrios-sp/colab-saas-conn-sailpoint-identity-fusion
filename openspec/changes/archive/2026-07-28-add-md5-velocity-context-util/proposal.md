## Why

Attribute definition templates often need deterministic hashed values — for example, generating opaque identifiers compatible with downstream systems that expect MD5 digests of email, employee ID, or other source attributes. Today the Velocity render context exposes normalization, JSON, and date helpers but no hashing utility, forcing operators to pre-compute hashes outside the connector or maintain fragile external scripts. Adding a native MD5 helper closes this gap with zero new dependencies.

## What Changes

**MD5 Velocity context helper**
- From: No hashing utility available in `$Normalize`, `$JSON`, or other context helpers
- To: `$MD5(input)` returns a lowercase hex MD5 digest of the input string
- Reason: Enable in-template deterministic hashing for attribute definitions
- Impact: Non-breaking additive change; existing templates unaffected

## Capabilities

### New Capabilities

None — behavior extends the existing definition-service Velocity context.

### Modified Capabilities

- `definition-service`: Velocity render context MUST expose an `MD5` function; `$MD5(text)` MUST compute lowercase hex MD5 digests with safe empty-input handling.

## Impact

- `src/services/definitionService/contextHelpers/` — new `md5.ts`, updated `index.ts`
- `src/services/definitionService/__tests__/formatting.test.ts` — new Velocity integration tests
- `docs/guides/define.md` — document `$MD5(...)` usage
- No new npm dependencies; uses Node.js native `crypto.createHash('md5')`
