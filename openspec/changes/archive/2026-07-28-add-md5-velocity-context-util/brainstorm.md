# Brainstorm: Add MD5 Velocity Context Util

## Context

Identity Fusion attribute definitions use Apache Velocity templates evaluated by `evaluateVelocityTemplate` in `definitionService/formatting.ts`. Template authors can call namespaced helpers exported from `contextHelpers` — today `Normalize`, `JSON`, `Datefns`, `AddressParse`, plus built-in `Math` and `String`.

There is no MD5 hashing helper. Operators who need deterministic hashed identifiers (e.g., legacy system compatibility, opaque IDs derived from email or employee number) must pre-compute hashes outside the connector or use brittle workarounds.

The codebase already uses Node.js `crypto` elsewhere (`createHash('sha256')` in client service, `crypto.randomUUID()` in definition service). Adding MD5 via native `crypto.createHash('md5')` aligns with project standards (no new dependencies).

## Decision Chain

### Q1: What API shape should the helper expose?

**Options:**
1. **Direct callable `$MD5(input)`** — simplest call site; MD5 registered as a function in context
2. **Namespaced object `MD5.hash(input)`** — matches `$JSON.stringify`, `$Normalize.phone` pattern
3. **Method on `Normalize`** — groups with string transforms but MD5 is hashing, not normalization

**Decision:** Option 1 — `$MD5(input)` as a direct function call in Velocity.

### Q2: What should empty or invalid input return?

**Options:**
1. Return `''` on null/undefined/non-string/empty trimmed input (matches `JSON.stringify` / `Normalize` fallback behavior)
2. Throw or return the raw input unchanged

**Decision:** Option 1 — return `''` so templates degrade gracefully and empty attribute values are not written.

### Q3: What digest format?

**Options:**
1. Lowercase hex (32 chars) — universal MD5 convention
2. Uppercase hex
3. Base64

**Decision:** Option 1 — lowercase hex, consistent with existing `createHash(...).digest('hex')` usage in the repo.

### Q4: Which spec owns this behavior?

**Options:**
1. Modify existing `definition-service` spec (Velocity render context requirement)
2. New standalone capability spec

**Decision:** Modify `definition-service` — MD5 is a Velocity context helper consumed exclusively by template evaluation, same ownership as `JSON` and `Normalize`.

## Agreed Approach

Add `src/services/definitionService/contextHelpers/md5.ts` exporting an `MD5(text: string): string` function using `crypto.createHash('md5')`. Register it in `contextHelpers/index.ts`. Add unit tests via `evaluateVelocityTemplate` in `formatting.test.ts`. Document `$MD5(...)` in `docs/guides/define.md` under the Apache Velocity context section.

Non-breaking additive change. No migration required for existing templates.

## Design Trade-offs

- **MD5 is cryptographically weak** — acceptable here for deterministic identifier generation in integration templates, not for security. Document that operators should not use this for password or secret hashing.
- **No HMAC / salt support in v1** — YAGNI; a single `$MD5(input)` covers the stated use case. Can extend later if needed.
