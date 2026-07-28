## Context

The definition service evaluates Apache Velocity templates for Normal and Unique attribute definitions. Helpers are exported from `contextHelpers/index.ts` and merged into the render context in `formatting.ts` via `Object.assign(Object.create(null), context, contextHelpers)`.

Existing helpers follow a namespaced object pattern (`Normalize.phone`, `JSON.stringify`). The `JSONHelper` in `contextHelpers/json.ts` is the closest analogue: a small module with safe fallbacks (`''` on failure) and logger integration.

The project targets modern Node.js (see `.nvmrc`, Node 24) and already uses `crypto` natively per `project-standards` spec.

## Goals / Non-Goals

**Goals:**
- Expose `$MD5(input)` as a direct function call in Velocity template expressions
- Return lowercase hex MD5 digest (32 characters) for valid string input
- Return `''` for null, undefined, non-string, or whitespace-only input
- Add integration tests via `evaluateVelocityTemplate`
- Document usage in `docs/guides/define.md`

**Non-Goals:**
- HMAC, salted, or keyed hashing
- SHA-256 or other digest algorithms (can be added as separate helpers later)
- Security-sensitive hashing (passwords, secrets) — MD5 is for deterministic identifier generation only
- Changes to unique-attribute collision logic or transform pipeline

## Decisions

### D1: Direct callable `$MD5()` function
- **Choice**: Export `MD5(text): string` as a function in `contextHelpers`
- **Reason**: Simplest template syntax — `$MD5($email)` — for a single-purpose hashing helper
- **Considered alternatives**: Namespaced `MD5.hash()` rejected per user preference; adding to `Normalize` rejected for semantic mismatch

### D2: Native Node.js crypto, no new dependency
- **Choice**: `crypto.createHash('md5').update(input).digest('hex')`
- **Reason**: Aligns with project-standards preference for native APIs; MD5 is built into Node crypto
- **Considered alternatives**: Third-party `md5` package rejected as unnecessary

### D3: Safe empty-input handling
- **Choice**: Return `''` when input is null, undefined, not a string, or empty after trim
- **Reason**: Matches `JSONHelper` and `Normalize` fallback behavior; prevents writing garbage attribute values
- **Considered alternatives**: Throwing on bad input rejected — would break template rendering for optional source fields

### D4: Lowercase hex output
- **Choice**: Return `digest('hex')` as-is (lowercase)
- **Reason**: Standard MD5 hex convention; matches existing `createHash` usage in `apiWriteClassification.ts`
- **Considered alternatives**: Uppercase or base64 rejected — not requested and less interoperable with typical MD5 consumers

## Risks / Trade-offs

- [Risk] Operators use MD5 for security-sensitive hashing → Mitigation: Document in `define.md` that `$MD5` is for deterministic identifiers, not secrets
- [Trade-off] MD5 is cryptographically broken for collision resistance → Accepted: integration identifier use case does not require collision resistance against adversaries

## Migration Plan

N/A — Additive helper with no deployment or configuration changes. Existing templates continue to work unchanged.

## Open Questions

None — scope is a single function helper following established patterns.
